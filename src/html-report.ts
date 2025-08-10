import { writeFile } from 'node:fs/promises';
import type { DailyConversation, ISOTimestamp } from './types.ts';

interface HourlyActivity {
    hour: number;
    messageCount: number;
    conversationTime: number;
    days: string[];
}

interface ProjectActivity {
    projectName: string;
    messageCount: number;
    conversationTime: number;
    sessionCount: number;
}

interface SessionDetail {
    start: Date;
    end: Date;
    duration: number; // in minutes
    messageCount: number;
    project?: string;
}

interface UserToUserGap {
    gap: number; // in minutes
    timestamp: Date;
    project?: string;
}

interface ChartData {
    daily: {
        labels: string[];
        messages: number[];
        conversationMinutes: number[];
    };
    hourly: {
        labels: string[];
        messages: number[];
        avgTime: number[];
    };
    projects: {
        labels: string[];
        messages: number[];
        conversationMinutes: number[];
    };
}

export function analyzeProjectActivity(allEntries: Array<{ timestamp: ISOTimestamp; cwd?: string }>): ProjectActivity[] {
    const projectData = new Map<string, { entries: Array<{ timestamp: ISOTimestamp }> }>();

    // Grouper les entrées par projet
    for (const entry of allEntries) {
        const projectPath = entry.cwd || 'Unknown Project';
        const projectName = projectPath.split('/').pop() || projectPath.split('\\').pop() || projectPath;

        if (!projectData.has(projectName)) {
            projectData.set(projectName, { entries: [] });
        }

        projectData.get(projectName)!.entries.push({ timestamp: entry.timestamp });
    }

    // Calculer le temps de conversation par projet (comme calculateConversationTime)
    return Array.from(projectData.entries())
        .map(([projectName, data]) => {
            const conversationTimeStr = calculateProjectConversationTime(data.entries);
            const conversationMinutes = convertToMinutes(conversationTimeStr);

            return {
                projectName,
                messageCount: data.entries.length,
                conversationTime: conversationMinutes,
                sessionCount: 0 // TODO: calculer les sessions par projet si nécessaire
            };
        })
        .sort((a, b) => b.conversationTime - a.conversationTime); // Trier par temps, pas par messages
}

function calculateProjectConversationTime(entries: Array<{ timestamp: ISOTimestamp }>): string {
    if (entries.length === 0) return '0m';
    if (entries.length === 1) return '1m';

    const sortedEntries = [...entries].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const sessions: Array<{ start: Date; end: Date }> = [];
    const SESSION_GAP_MS = 3 * 60 * 1000; // 3 minutes

    let currentSessionStart = new Date(sortedEntries[0].timestamp);
    let currentSessionEnd = new Date(sortedEntries[0].timestamp);

    for (let i = 1; i < sortedEntries.length; i++) {
        const currentTime = new Date(sortedEntries[i].timestamp);
        const timeSinceLastMessage = currentTime.getTime() - currentSessionEnd.getTime();

        if (timeSinceLastMessage <= SESSION_GAP_MS) {
            currentSessionEnd = currentTime;
        } else {
            sessions.push({ start: currentSessionStart, end: currentSessionEnd });
            currentSessionStart = currentTime;
            currentSessionEnd = currentTime;
        }
    }
    sessions.push({ start: currentSessionStart, end: currentSessionEnd });

    let totalMinutes = 0;
    for (const session of sessions) {
        const sessionDurationMs = session.end.getTime() - session.start.getTime();
        const sessionMinutes = Math.max(1, Math.floor(sessionDurationMs / (1000 * 60)));
        totalMinutes += sessionMinutes;
    }

    if (totalMinutes < 60) {
        return `${totalMinutes}m`;
    }

    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (minutes === 0) {
        return `${hours}h`;
    }

    return `${hours}h ${minutes}m`;
}

export function analyzeSessionDetails(allEntries: Array<{ timestamp: ISOTimestamp; cwd?: string; message?: { role?: string } }>): SessionDetail[] {
    if (allEntries.length === 0) return [];

    const sortedEntries = [...allEntries].sort((a, b) =>
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const sessions: SessionDetail[] = [];
    const SESSION_GAP_MS = 3 * 60 * 1000; // 3 minutes

    let currentSessionStart = new Date(sortedEntries[0].timestamp);
    let currentSessionEnd = new Date(sortedEntries[0].timestamp);
    let currentSessionMessages = 1;
    let currentProject = sortedEntries[0].cwd;

    for (let i = 1; i < sortedEntries.length; i++) {
        const currentTime = new Date(sortedEntries[i].timestamp);
        const timeSinceLastMessage = currentTime.getTime() - currentSessionEnd.getTime();

        if (timeSinceLastMessage <= SESSION_GAP_MS) {
            currentSessionEnd = currentTime;
            currentSessionMessages++;
        } else {
            // End current session
            const duration = Math.max(1, Math.floor((currentSessionEnd.getTime() - currentSessionStart.getTime()) / (1000 * 60)));
            sessions.push({
                start: currentSessionStart,
                end: currentSessionEnd,
                duration,
                messageCount: currentSessionMessages,
                project: currentProject?.split('/').pop() || currentProject?.split('\\').pop() || 'Unknown'
            });

            // Start new session
            currentSessionStart = currentTime;
            currentSessionEnd = currentTime;
            currentSessionMessages = 1;
            currentProject = sortedEntries[i].cwd;
        }
    }

    // Add the last session
    const duration = Math.max(1, Math.floor((currentSessionEnd.getTime() - currentSessionStart.getTime()) / (1000 * 60)));
    sessions.push({
        start: currentSessionStart,
        end: currentSessionEnd,
        duration,
        messageCount: currentSessionMessages,
        project: currentProject?.split('/').pop() || currentProject?.split('\\').pop() || 'Unknown'
    });

    return sessions.sort((a, b) => b.duration - a.duration); // Sort by duration desc
}

export function analyzeUserToUserGaps(allEntries: Array<{ timestamp: ISOTimestamp; cwd?: string; message?: { role?: string } }>): UserToUserGap[] {
    const userMessages = allEntries
        .filter(entry => entry.message?.role === 'user')
        .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

    const gaps: UserToUserGap[] = [];

    for (let i = 1; i < userMessages.length; i++) {
        const prevTime = new Date(userMessages[i - 1].timestamp);
        const currentTime = new Date(userMessages[i].timestamp);
        const gap = Math.floor((currentTime.getTime() - prevTime.getTime()) / (1000 * 60));

        if (gap > 3) { // Only show gaps > 3 minutes (meaningful pauses)
            gaps.push({
                gap,
                timestamp: currentTime,
                project: userMessages[i].cwd?.split('/').pop() || userMessages[i].cwd?.split('\\').pop() || 'Unknown'
            });
        }
    }

    return gaps.sort((a, b) => b.gap - a.gap); // Sort by gap desc
}

export function analyzeHourlyActivity(allEntries: Array<{ timestamp: ISOTimestamp }>): HourlyActivity[] {
    const hourlyData = new Map<number, { messages: number; days: Set<string>; totalTime: number }>();

    for (let hour = 0; hour < 24; hour++) {
        hourlyData.set(hour, { messages: 0, days: new Set(), totalTime: 0 });
    }

    for (const entry of allEntries) {
        const date = new Date(entry.timestamp);
        const hour = date.getHours();
        const dayKey = date.toDateString();

        const data = hourlyData.get(hour)!;
        data.messages++;
        data.days.add(dayKey);
    }

    return Array.from(hourlyData.entries()).map(([hour, data]) => ({
        hour,
        messageCount: data.messages,
        conversationTime: 0,
        days: Array.from(data.days)
    }));
}

function convertToMinutes(timeStr: string): number {
    const parts = timeStr.match(/(?:(\d+)h)?\s*(?:(\d+)m)?/);
    if (!parts) return 0;

    const hours = parseInt(parts[1] || '0', 10);
    const minutes = parseInt(parts[2] || '0', 10);
    return hours * 60 + minutes;
}

function prepareChartData(conversations: DailyConversation[], projectActivity: ProjectActivity[]): ChartData {
    const daily = {
        labels: conversations.map(c => c.date),
        messages: conversations.map(c => c.messageCount),
        conversationMinutes: conversations.map(c => convertToMinutes(c.estimatedConversationTime))
    };

    const hourlyLabels = Array.from({ length: 24 }, (_, i) => `${i.toString().padStart(2, '0')}:00`);

    return {
        daily,
        hourly: {
            labels: hourlyLabels,
            messages: new Array(24).fill(0),
            avgTime: new Array(24).fill(0)
        },
        projects: {
            labels: projectActivity.map(p => p.projectName),
            messages: projectActivity.map(p => p.messageCount),
            conversationMinutes: projectActivity.map(p => p.conversationTime)
        }
    };
}

export async function generateHtmlReport(
    conversations: DailyConversation[],
    allEntries: Array<{ timestamp: ISOTimestamp; cwd?: string; message?: { role?: string } }>,
    filename: string
): Promise<void> {
    const hourlyActivity = analyzeHourlyActivity(allEntries);
    const projectActivity = analyzeProjectActivity(allEntries);
    const sessionDetails = analyzeSessionDetails(allEntries);
    const userToUserGaps = analyzeUserToUserGaps(allEntries);
    const chartData = prepareChartData(conversations, projectActivity);

    const totalMessages = conversations.reduce((sum, c) => sum + c.messageCount, 0);
    const totalSessions = conversations.reduce((sum, c) => sum + c.sessionIds.length, 0);
    const avgMessagesPerDay = Math.round(totalMessages / conversations.length);
    const totalConversationMinutes = conversations.reduce((sum, c) => sum + convertToMinutes(c.estimatedConversationTime), 0);

    function formatTotalTime(totalMinutes: number): string {
        if (totalMinutes < 60) return `${totalMinutes}m`;
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        if (minutes === 0) return `${hours}h`;
        return `${hours}h ${minutes}m`;
    }

    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>cctime - Claude Code Conversation Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <style>
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px; 
            background: #f8fafc;
        }
        .header { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin-bottom: 20px;
        }
        .stats { 
            display: grid; 
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
            gap: 15px; 
            margin: 20px 0; 
        }
        .stat-card { 
            background: white; 
            padding: 15px; 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        .stat-value { 
            font-size: 24px; 
            font-weight: bold; 
            color: #3b82f6; 
        }
        .stat-label { 
            color: #6b7280; 
            font-size: 14px; 
        }
        .chart-container { 
            background: white; 
            padding: 20px; 
            border-radius: 8px; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
            margin: 20px 0; 
        }
        .chart-title { 
            font-size: 18px; 
            font-weight: bold; 
            margin-bottom: 15px; 
            color: #1f2937;
        }
        table { 
            width: 100%; 
            border-collapse: collapse; 
            background: white; 
            border-radius: 8px; 
            overflow: hidden; 
            box-shadow: 0 1px 3px rgba(0,0,0,0.1);
        }
        th, td { 
            padding: 12px; 
            text-align: left; 
            border-bottom: 1px solid #e5e7eb; 
        }
        th { 
            background: #f9fafb; 
            font-weight: 600; 
            color: #374151;
        }
        tr:hover { 
            background: #f9fafb; 
        }
        .generated-time {
            color: #6b7280;
            font-size: 12px;
            text-align: center;
            margin-top: 20px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>Claude Code - Time</h1>
        <p>Analysis of your Claude Code conversation patterns and activity</p>
    </div>

    <div class="stats">
        <div class="stat-card">
            <div class="stat-value">${conversations.length}</div>
            <div class="stat-label">Active Days</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalMessages.toLocaleString()}</div>
            <div class="stat-label">Total Messages</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${totalSessions}</div>
            <div class="stat-label">Total Sessions</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${avgMessagesPerDay}</div>
            <div class="stat-label">Avg Messages/Day</div>
        </div>
        <div class="stat-card">
            <div class="stat-value">${formatTotalTime(totalConversationMinutes)}</div>
            <div class="stat-label">Total Conv. Time</div>
        </div>
    </div>

    <div class="chart-container">
        <div class="chart-title">📈 Daily Message Activity</div>
        <canvas id="dailyChart" width="400" height="150"></canvas>
    </div>

    <div class="chart-container">
        <div class="chart-title">⏰ Hourly Activity Pattern</div>
        <canvas id="hourlyChart" width="400" height="150"></canvas>
    </div>

    <div class="chart-container">
        <div class="chart-title">📁 Conversation Time by Project</div>
        <canvas id="projectChart" width="400" height="150"></canvas>
    </div>

    <div class="chart-container">
        <div class="chart-title">📊 Daily Conversation Summary</div>
        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>First Message</th>
                    <th>Last Message</th>
                    <th>Conv. Time</th>
                    <th>Messages</th>
                    <th>Sessions</th>
                </tr>
            </thead>
            <tbody>
                ${conversations.map(c => `
                    <tr>
                        <td>${c.date}</td>
                        <td>${c.firstMessageTime}</td>
                        <td>${c.lastMessageTime}</td>
                        <td>${c.estimatedConversationTime}</td>
                        <td>${c.messageCount.toLocaleString()}</td>
                        <td>${c.sessionIds.length}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        
        <div style="margin-top: 15px; padding: 15px; background: #f9fafb; border-radius: 6px; font-size: 14px;">
            <strong>📊 Summary:</strong> 
            ${conversations.length} days • 
            ${totalMessages.toLocaleString()} messages • 
            ${totalSessions} sessions • 
            ${formatTotalTime(totalConversationMinutes)} total time
        </div>
    </div>

    <div class="chart-container">
        <div class="chart-title">⏱️ Individual Sessions (Top 20)</div>
        <table>
            <thead>
                <tr>
                    <th>Start Time</th>
                    <th>End Time</th>
                    <th>Duration</th>
                    <th>Messages</th>
                    <th>Project</th>
                </tr>
            </thead>
            <tbody>
                ${sessionDetails.slice(0, 20).map(session => `
                    <tr>
                        <td>${session.start.toLocaleString()}</td>
                        <td>${session.end.toLocaleString()}</td>
                        <td>${session.duration < 60 ? session.duration + 'm' : Math.floor(session.duration / 60) + 'h ' + (session.duration % 60) + 'm'}</td>
                        <td>${session.messageCount}</td>
                        <td>${session.project}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="chart-container">
        <div class="chart-title">🤔 User Thinking Time (Gaps > 3min, Top 20)</div>
        <table>
            <thead>
                <tr>
                    <th>Timestamp</th>
                    <th>Gap Duration</th>
                    <th>Project</th>
                </tr>
            </thead>
            <tbody>
                ${userToUserGaps.slice(0, 20).map(gap => `
                    <tr>
                        <td>${gap.timestamp.toLocaleString()}</td>
                        <td>${gap.gap < 60 ? gap.gap + 'm' : Math.floor(gap.gap / 60) + 'h ' + (gap.gap % 60) + 'm'}</td>
                        <td>${gap.project}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    </div>

    <div class="generated-time">
        Generated on ${new Date().toLocaleString()} by cctime
    </div>

    <script>
        const chartData = ${JSON.stringify(chartData)};
        const hourlyActivity = ${JSON.stringify(hourlyActivity)};
        const projectActivity = ${JSON.stringify(projectActivity)};

        // Daily Messages Chart
        new Chart(document.getElementById('dailyChart'), {
            type: 'line',
            data: {
                labels: chartData.daily.labels,
                datasets: [
                    {
                        label: 'Messages',
                        data: chartData.daily.messages,
                        borderColor: '#3b82f6',
                        backgroundColor: 'rgba(59, 130, 246, 0.1)',
                        tension: 0.3,
                        yAxisID: 'y'
                    },
                    {
                        label: 'Conversation Time (minutes)',
                        data: chartData.daily.conversationMinutes,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.3,
                        yAxisID: 'y1'
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        display: true,
                        position: 'left',
                        title: { display: true, text: 'Messages' }
                    },
                    y1: {
                        type: 'linear',
                        display: true,
                        position: 'right',
                        title: { display: true, text: 'Minutes' },
                        grid: { drawOnChartArea: false }
                    }
                },
                plugins: {
                    legend: { display: true }
                }
            }
        });

        // Hourly Activity Chart
        new Chart(document.getElementById('hourlyChart'), {
            type: 'bar',
            data: {
                labels: hourlyActivity.map(h => h.hour + ':00'),
                datasets: [{
                    label: 'Messages per Hour',
                    data: hourlyActivity.map(h => h.messageCount),
                    backgroundColor: 'rgba(59, 130, 246, 0.6)',
                    borderColor: '#3b82f6',
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                scales: {
                    y: {
                        beginAtZero: true,
                        title: { display: true, text: 'Total Messages' }
                    },
                    x: {
                        title: { display: true, text: 'Hour of Day' }
                    }
                },
                plugins: {
                    legend: { display: false }
                }
            }
        });

        // Project Activity Chart
        new Chart(document.getElementById('projectChart'), {
            type: 'doughnut',
            data: {
                labels: chartData.projects.labels,
                datasets: [{
                    label: 'Conversation Time (minutes)',
                    data: chartData.projects.conversationMinutes,
                    backgroundColor: [
                        '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6',
                        '#06b6d4', '#84cc16', '#f97316', '#ec4899', '#14b8a6'
                    ],
                    borderWidth: 2,
                    borderColor: '#ffffff'
                }]
            },
            options: {
                responsive: true,
                plugins: {
                    legend: { 
                        display: true,
                        position: 'right'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const minutes = context.parsed;
                                const hours = Math.floor(minutes / 60);
                                const mins = minutes % 60;
                                const timeStr = hours > 0 ? 
                                    (mins > 0 ? hours + 'h ' + mins + 'm' : hours + 'h') : 
                                    minutes + 'm';
                                return context.label + ': ' + timeStr;
                            }
                        }
                    }
                }
            }
        });
    </script>
</body>
</html>`;

    await writeFile(filename, html, 'utf8');
}
