import { Bot, InlineKeyboard } from "grammy";
import { exec } from "child_process";
import { promisify } from "util";
import * as os from "os";
const execAsync = promisify(exec);


const BOT_TOKEN = process.env.BOT_TOKEN;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN is not set in environment variables.");
}
if (!ADMIN_CHAT_ID) {
    throw new Error("ADMIN_CHAT_ID is not set in environment variables.");
}

const bot = new Bot(BOT_TOKEN);

interface SystemStats {
    hostname: string;
    uptime: string;
    loadAverage: number[];
    cpuUsage: number;
    memoryUsage: {
        total: number;
        used: number;
        free: number;
        percentage: number;
    };
    diskUsage: {
        total: number;
        used: number;
        available: number;
        percentage: number;
    };
    networkStats: {
        received: number;
        transmitted: number;
    };
    processes: number;
    timestamp: string;
}

// Fungsi untuk mendapatkan CPU usage
async function getCpuUsage(): Promise<number> {
    try {
        const { stdout } = await execAsync("top -bn1 | grep 'Cpu(s)' | awk '{print $2}' | cut -d'%' -f1");
        return parseFloat(stdout.trim()) || 0;
    } catch {
        return 0;
    }
}

// Fungsi untuk mendapatkan disk usage
async function getDiskUsage(): Promise<{ total: number; used: number; available: number; percentage: number }> {
    try {
        const { stdout } = await execAsync("df -h / | awk 'NR==2 {print $2\" \"$3\" \"$4\" \"$5}'");
        const [total, used, available, percentage] = stdout.trim().split(' ');

        return {
            total: parseFloat(total ?? "0") || 0,
            used: parseFloat(used ?? "0") || 0,
            available: parseFloat(available ?? "0") || 0,
            percentage: parseFloat((percentage ?? "0").replace('%', '')) || 0
        };
    } catch {
        return { total: 0, used: 0, available: 0, percentage: 0 };
    }
}

// Fungsi untuk mendapatkan network stats
async function getNetworkStats(): Promise<{ received: number; transmitted: number }> {
    try {
        const { stdout } = await execAsync("cat /proc/net/dev | grep -E 'eth0|ens|enp' | head -1 | awk '{print $2\" \"$10}'");
        const [received, transmitted] = stdout.trim().split(' ').map(Number);

        return {
            received: received || 0,
            transmitted: transmitted || 0
        };
    } catch {
        return { received: 0, transmitted: 0 };
    }
}

// Fungsi untuk mendapatkan jumlah proses
async function getProcessCount(): Promise<number> {
    try {
        const { stdout } = await execAsync("ps aux | wc -l");
        return parseInt(stdout.trim()) - 1; // -1 untuk header
    } catch {
        return 0;
    }
}

// Fungsi utama untuk mengumpulkan semua stats
async function getSystemStats(): Promise<SystemStats> {
    const cpuUsage = await getCpuUsage();
    const diskUsage = await getDiskUsage();
    const networkStats = await getNetworkStats();
    const processCount = await getProcessCount();

    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    return {
        hostname: os.hostname(),
        uptime: formatUptime(os.uptime()),
        loadAverage: os.loadavg(),
        cpuUsage,
        memoryUsage: {
            total: Math.round(totalMemory / 1024 / 1024 / 1024 * 100) / 100, // GB
            used: Math.round(usedMemory / 1024 / 1024 / 1024 * 100) / 100, // GB
            free: Math.round(freeMemory / 1024 / 1024 / 1024 * 100) / 100, // GB
            percentage: Math.round((usedMemory / totalMemory) * 100)
        },
        diskUsage,
        networkStats,
        processes: processCount,
        timestamp: new Date().toLocaleString('id-ID')
    };
}

// Fungsi untuk format uptime
function formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);

    return `${days}d ${hours}h ${minutes}m`;
}

// Fungsi untuk membuat status bar
function createStatusBar(percentage: number, length: number = 10): string {
    const filled = Math.round((percentage / 100) * length);
    const empty = length - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
}

// Fungsi untuk format pesan status dengan emoji dan styling
function formatSystemMessage(stats: SystemStats): string {
    const cpuBar = createStatusBar(stats.cpuUsage);
    const memBar = createStatusBar(stats.memoryUsage.percentage);
    const diskBar = createStatusBar(stats.diskUsage.percentage);

    // Emoji berdasarkan load
    const cpuEmoji = stats.cpuUsage > 80 ? '🔴' : stats.cpuUsage > 50 ? '🟡' : '🟢';
    const memEmoji = stats.memoryUsage.percentage > 80 ? '🔴' : stats.memoryUsage.percentage > 50 ? '🟡' : '🟢';
    const diskEmoji = stats.diskUsage.percentage > 80 ? '🔴' : stats.diskUsage.percentage > 50 ? '🟡' : '🟢';

    return `
🖥️ **${stats.hostname}** 
📊 *Status System - ${stats.timestamp}*

⏱️ **Uptime:** ${stats.uptime}
🔄 **Load Avg:** ${stats.loadAverage.map(l => l.toFixed(2)).join(' | ')}
🧮 **Processes:** ${stats.processes}

${cpuEmoji} **CPU Usage: ${stats.cpuUsage.toFixed(1)}%**
\`${cpuBar}\` ${stats.cpuUsage.toFixed(1)}%

${memEmoji} **Memory: ${stats.memoryUsage.used}GB / ${stats.memoryUsage.total}GB**
\`${memBar}\` ${stats.memoryUsage.percentage}%

${diskEmoji} **Disk: ${stats.diskUsage.used}GB / ${stats.diskUsage.total}GB**
\`${diskBar}\` ${stats.diskUsage.percentage}%

🌐 **Network:**
↗️ TX: ${(stats.networkStats.transmitted / 1024 / 1024).toFixed(2)} MB
↙️ RX: ${(stats.networkStats.received / 1024 / 1024).toFixed(2)} MB

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`;
}

// Inline keyboard untuk aksi
function createActionKeyboard() {
    return new InlineKeyboard()
        .text("🔄 Refresh", "refresh")
        .text("📊 Detail", "detail").row()
        .text("🔍 Top Processes", "top")
        .text("💾 Disk Info", "disk").row()
        .text("🌐 Network", "network")
        .text("⚙️ Services", "services");
}

// Command handlers
bot.command("start", (ctx) => {
    const welcomeMessage = `
🤖 **VPS Monitor Bot Aktif!**

Commands yang tersedia:
📊 /status - Status sistem real-time
🔄 /monitor - Mulai monitoring otomatis
⏹️ /stop - Stop monitoring
🔍 /top - Proses yang berjalan
💾 /disk - Info disk detail
🌐 /network - Status network
⚙️ /services - Status services
🏓 /ping - Test bot

Bot ini akan memantau VPS Anda secara real-time!
Bot By Bima Adam
  `;

    ctx.reply(welcomeMessage, { parse_mode: "Markdown" });
});

bot.command("status", async (ctx) => {
    const loadingMsg = await ctx.reply("⏳ Mengambil data sistem...");

    try {
        const stats = await getSystemStats();
        const message = formatSystemMessage(stats);
        const keyboard = createActionKeyboard();

        await ctx.api.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            message,
            {
                parse_mode: "Markdown",
                reply_markup: keyboard
            }
        );
    } catch (error) {
        await ctx.api.editMessageText(
            ctx.chat.id,
            loadingMsg.message_id,
            `❌ Error: ${error}`
        );
    }
});

// Callback query handlers
bot.callbackQuery("refresh", async (ctx) => {
    await ctx.answerCallbackQuery("🔄 Refreshing...");

    try {
        const stats = await getSystemStats();
        const message = formatSystemMessage(stats);
        const keyboard = createActionKeyboard();

        await ctx.editMessageText(message, {
            parse_mode: "Markdown",
            reply_markup: keyboard
        });
    } catch (error) {
        await ctx.answerCallbackQuery(`❌ Error: ${error}`);
    }
});

bot.callbackQuery("top", async (ctx) => {
    await ctx.answerCallbackQuery("📊 Getting top processes...");

    try {
        const { stdout } = await execAsync("ps aux --sort=-%cpu | head -11");
        const message = `🔍 **Top Processes (CPU Usage)**\n\n\`${stdout}\``;

        await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
        await ctx.answerCallbackQuery(`❌ Error: ${error}`);
    }
});

bot.callbackQuery("disk", async (ctx) => {
    await ctx.answerCallbackQuery("💾 Getting disk info...");

    try {
        const { stdout } = await execAsync("df -h");
        const message = `💾 **Disk Information**\n\n\`${stdout}\``;

        await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
        await ctx.answerCallbackQuery(`❌ Error: ${error}`);
    }
});

bot.callbackQuery("network", async (ctx) => {
    await ctx.answerCallbackQuery("🌐 Getting network info...");

    try {
        const { stdout: interfaces } = await execAsync("ip addr show | grep -E 'inet.*scope global'");
        const { stdout: connections } = await execAsync("ss -tuln | wc -l");

        const message = `🌐 **Network Information**\n\n**Active Connections:** ${connections.trim()}\n\n**Interfaces:**\n\`${interfaces}\``;

        await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
        await ctx.answerCallbackQuery(`❌ Error: ${error}`);
    }
});

bot.callbackQuery("services", async (ctx) => {
    await ctx.answerCallbackQuery("⚙️ Checking services...");

    try {
        const { stdout } = await execAsync("systemctl list-units --type=service --state=running | head -20");
        const message = `⚙️ **Active Services**\n\n\`${stdout}\``;

        await ctx.reply(message, { parse_mode: "Markdown" });
    } catch (error) {
        await ctx.answerCallbackQuery(`❌ Error: ${error}`);
    }
});

// Monitoring variables
let monitoringInterval: NodeJS.Timeout | null = null;
let alertThresholds = {
    cpu: 80,
    memory: 85,
    disk: 90
};

// Auto monitoring
bot.command("monitor", async (ctx) => {
    if (monitoringInterval) {
        await ctx.reply("⚠️ Monitoring sudah berjalan! Gunakan /stop untuk menghentikan.");
        return;
    }

    await ctx.reply("🔄 **Monitoring dimulai!**\n\nBot akan mengirim laporan setiap 5 menit dan alert jika ada masalah.", { parse_mode: "Markdown" });

    let alertsSent: Set<string> = new Set();

    monitoringInterval = setInterval(async () => {
        try {
            const stats = await getSystemStats();

            // Check for alerts
            const alerts: string[] = [];

            if (stats.cpuUsage > alertThresholds.cpu && !alertsSent.has('cpu')) {
                alerts.push(`🔴 **CPU Alert:** ${stats.cpuUsage.toFixed(1)}% (>${alertThresholds.cpu}%)`);
                alertsSent.add('cpu');
            } else if (stats.cpuUsage <= alertThresholds.cpu) {
                alertsSent.delete('cpu');
            }

            if (stats.memoryUsage.percentage > alertThresholds.memory && !alertsSent.has('memory')) {
                alerts.push(`🔴 **Memory Alert:** ${stats.memoryUsage.percentage}% (>${alertThresholds.memory}%)`);
                alertsSent.add('memory');
            } else if (stats.memoryUsage.percentage <= alertThresholds.memory) {
                alertsSent.delete('memory');
            }

            if (stats.diskUsage.percentage > alertThresholds.disk && !alertsSent.has('disk')) {
                alerts.push(`🔴 **Disk Alert:** ${stats.diskUsage.percentage}% (>${alertThresholds.disk}%)`);
                alertsSent.add('disk');
            } else if (stats.diskUsage.percentage <= alertThresholds.disk) {
                alertsSent.delete('disk');
            }

            // Send alerts if any
            if (alerts.length > 0) {
                const alertMessage = `🚨 **VPS ALERT - ${stats.hostname}**\n\n${alerts.join('\n')}\n\n${formatSystemMessage(stats)}`;
                await bot.api.sendMessage(ADMIN_CHAT_ID, alertMessage, { parse_mode: "Markdown" });
            }

            // Send regular status every 5 minutes
            const now = new Date();
            if (now.getMinutes() % 5 === 0) {
                const message = `📊 **Regular Status Report**\n${formatSystemMessage(stats)}`;
                await bot.api.sendMessage(ADMIN_CHAT_ID, message, {
                    parse_mode: "Markdown",
                    reply_markup: createActionKeyboard()
                });
            }

        } catch (error) {
            console.error("Monitoring error:", error);
        }
    }, 60000); // Check every minute
});

bot.command("stop", async (ctx) => {
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
        monitoringInterval = null;
        await ctx.reply("⏹️ **Monitoring dihentikan.**", { parse_mode: "Markdown" });
    } else {
        await ctx.reply("⚠️ Monitoring tidak sedang berjalan.");
    }
});

bot.command("ping", (ctx) => {
    const startTime = Date.now();
    ctx.reply("🏓 Pong!").then(() => {
        const endTime = Date.now();
        const responseTime = endTime - startTime;
        ctx.reply(`⚡ Response time: ${responseTime}ms`);
    });
});

// Error handling
bot.catch((err) => {
    console.error("Bot error:", err);
});

// Start bot
console.log("🚀 Starting VPS Monitor Bot...");
bot.start();

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n👋 Stopping VPS Monitor Bot...');
    if (monitoringInterval) {
        clearInterval(monitoringInterval);
    }
    bot.stop();
    process.exit(0);
});

export { bot, getSystemStats, formatSystemMessage };