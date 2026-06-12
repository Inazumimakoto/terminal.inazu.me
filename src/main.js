import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import "./styles.css";

const terminalHost = document.querySelector("#terminal");
const terminalFrame = document.querySelector(".terminal-frame");
const logoHeader = document.querySelector("#logoHeader");
const logoScale = document.querySelector("#logoScale");
const logoArt = document.querySelector("#logoArt");

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  green: "\x1b[38;2;128;216;105m",
  brightGreen: "\x1b[38;2;156;255;125m",
  muted: "\x1b[38;2;134;139;128m",
  dim: "\x1b[38;2;92;99;91m",
  yellow: "\x1b[38;2;214;201;120m",
  cyan: "\x1b[38;2;121;215;208m",
  red: "\x1b[38;2;228;155;141m",
};

const commands = [
  "help",
  "clear",
  "cat",
  "touch",
  "sudo",
  "ssh",
  "ps",
  "ping",
  "exit",
  "ls",
  "sl",
  "man",
  "grep",
  "whoami",
  "cd",
];

let promptHost = "ようこそこんにちは";
let inputBuffer = "";
let history = [];
let historyIndex = 0;
let shellState = "booting";
let trainRunning = false;
let trainOffsetPx = 0;

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const fitAddon = new FitAddon();
const term = new Terminal({
  allowTransparency: true,
  convertEol: false,
  cursorBlink: true,
  cursorStyle: "block",
  disableStdin: true,
  fontFamily:
    '"SFMono-Regular", "Cascadia Mono", "Menlo", "Consolas", "Liberation Mono", "Noto Sans Mono CJK JP", monospace',
  fontSize: window.innerWidth <= 520 ? 13 : 15,
  letterSpacing: 0,
  lineHeight: 1.2,
  scrollback: 1600,
  theme: {
    background: "#000000",
    foreground: "#c5c7bd",
    cursor: "#c5c7bd",
    cursorAccent: "#000000",
    selectionBackground: "#28462b",
    black: "#000000",
    red: "#e49b8d",
    green: "#80d869",
    yellow: "#d6c978",
    blue: "#6fb7df",
    magenta: "#c08eda",
    cyan: "#79d7d0",
    white: "#c5c7bd",
    brightBlack: "#5c635b",
    brightRed: "#ffb4a6",
    brightGreen: "#9cff7d",
    brightYellow: "#fff08a",
    brightBlue: "#96d6ff",
    brightMagenta: "#d8a8f1",
    brightCyan: "#a2fff6",
    brightWhite: "#f2f4ea",
  },
});

term.loadAddon(fitAddon);
term.open(terminalHost);

requestAnimationFrame(() => {
  fitAddon.fit();
  term.focus();
});

window.addEventListener("resize", () => {
  term.options.fontSize = window.innerWidth <= 520 ? 13 : 15;
  updateLogoScale();
  fitAddon.fit();
});

const terminalResizeObserver = new ResizeObserver(() => {
  updateLogoScale();
  fitAddon.fit();
});
terminalResizeObserver.observe(terminalHost);
terminalResizeObserver.observe(logoHeader);

function delay(ms) {
  if (reducedMotion) return Promise.resolve();
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function setIdentity(nextHost) {
  promptHost = nextHost;
}

function prompt() {
  return `${colors.green}${promptHost}${colors.reset} ~ ${colors.green}$${colors.reset} `;
}

function write(value) {
  term.write(value);
}

function writeln(value = "") {
  term.write(`${value}\r\n`);
}

function clearTerminal() {
  term.write("\x1b[2J\x1b[3J\x1b[H");
}

function writePrompt() {
  inputBuffer = "";
  write(prompt());
}

function replaceInput(nextValue) {
  write("\b \b".repeat(inputBuffer.length));
  inputBuffer = nextValue;
  write(inputBuffer);
}

async function typeAnimated(value, speed = 52) {
  for (const char of value) {
    write(char);
    await delay(speed);
  }
}

function bootPause(index) {
  const pauses = [
    4, 5, 4, 6, 12, 4, 5, 6, 8, 28,
    4, 5, 10, 4, 22, 5, 4, 5, 12, 34,
    4, 5, 6, 14, 5, 26, 4, 4, 7, 10,
    38, 5, 6, 4, 6, 24, 9, 4, 4, 32,
    5, 4, 9, 4, 18, 5, 4, 5, 8, 30,
    4, 11, 5, 4, 36, 5, 5, 4, 14, 31,
    4, 5, 10, 4,
  ];

  return pauses[index % pauses.length];
}

function bootEntryDelay(item, index) {
  if (item.type === "welcome") return item.pause ?? 700;
  if (!item.pause) return bootPause(index);
  return item.pause;
}

async function writeBootEntry(entry, index) {
  const item = typeof entry === "string" ? { text: entry, type: "ok" } : entry;
  const text = item.text;
  const type = item.type ?? "ok";

  if (type === "plain") {
    writeln(`${colors.dim}${text}${colors.reset}`);
  } else if (type === "info") {
    writeln(`${colors.cyan}[INFO]${colors.reset} ${colors.muted}${text}${colors.reset}`);
  } else if (type === "warn") {
    writeln(`${colors.yellow}[WARN]${colors.reset} ${colors.muted}${text}${colors.reset}`);
  } else if (type === "wait") {
    writeln(`${colors.yellow}[WAIT]${colors.reset} ${colors.muted}${text}${colors.reset}`);
  } else if (type === "welcome") {
    const width = Math.max(42, Math.min(term.cols - 2, 68));
    const border = "=".repeat(width);
    writeln();
    writeln(`${colors.brightGreen}${border}${colors.reset}`);
    writeln(`${colors.brightGreen}${colors.bold}WELCOME ${text}${colors.reset}`);
    writeln(`${colors.brightGreen}${border}${colors.reset}`);
    writeln();
  } else {
    writeln(`${colors.green}[ OK ]${colors.reset} ${colors.muted}${text}${colors.reset}`);
  }

  await delay(bootEntryDelay(item, index));
}

async function runBootPhase(phase, phaseIndex) {
  if (phase.title) {
    writeln(`${colors.dim}${phase.title}${colors.reset}`);
    await delay(phase.titlePause ?? 60);
  }

  for (const [index, entry] of phase.entries.entries()) {
    await writeBootEntry(entry, phaseIndex * 100 + index);
  }

  if (phase.clearAfter) {
    await delay(phase.hold ?? 110);
    clearTerminal();
    await delay(phase.afterClearPause ?? 70);
  }
}

function bootBatch(prefix, items, type = "ok") {
  return items.map((item) => ({ type, text: `${prefix}: ${item}` }));
}

function randomItem(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function linkify(text, url) {
  return `\x1b]8;;${url}\x1b\\${text}\x1b]8;;\x1b\\`;
}

function renderBanner() {
  return {
    body: [
      " __  __    ___    _  __    ___    _____    ___   ",
      "|  \\/  |  /   \\  | |/ /   / _ \\  |_   _|  / _ \\  ",
      "| |\\/| |  | - |  | ' <   | (_) |   | |   | (_) | ",
      "|_|__|_|  |_|_|  |_|\\_\\   \\___/   _|_|_   \\___/  ",
      "_|\"\"\"\"\"|_|\"\"\"\"\"|_|\"\"\"\"\"|_|\"\"\"\"\"|_|\"\"\"\"\"|_|\"\"\"\"\"| ",
      "\"`-0-0-'\"`-0-0-'\"`-0-0-'\"`-0-0-'\"`-0-0-'\"`-0-0-' ",
    ],
    railTop: "_______________________________",
    railBottom: "ㅗ".repeat(22),
  };
}

function renderHelpLines() {
  const rows = [
    ["help", "この説明を表示します"],
    ["clear", "画面を消します"],
    ["cat", "猫のAAを表示します"],
    ["touch", "呼吸を止めて1秒を出力します"],
    ["sudo", "須藤さんを呼び出します"],
    ["ssh", "ひそひそ返事をします"],
    ["ps", "プロセス一覧を表示します"],
    ["ping", "pong を返します"],
    ["exit", "終了を拒否します"],
    ["ls", "MAKOTO列車を走らせます"],
    ["sl", "MAKOTO列車を走らせます"],
    ["man", "男を表示します"],
    ["grep", "ぶどうのAAを表示します"],
    ["whoami", "自己紹介を表示します"],
    ["cd", "CDを表示します"],
  ];

  return [
    `${colors.muted}使えるコマンド:${colors.reset}`,
    ...rows.map(([name, description]) => {
      const label = `\`${name}\``;
      const tabs = label.length < 8 ? "\t\t" : "\t";
      return `${colors.green}${label}${colors.reset}${tabs}${description}`;
    }),
  ];
}

function renderWhoamiLines() {
  return [
    "いなずみ まこと / inazumi makoto",
    "現在M1。ネットワーク系の研究をしています。",
    "セキュリティが好きです。",
    "変なものばっかり作っています。",
    `GUI版はこちらへ -> ${linkify("inazu.me", "https://inazu.me")}`,
    "ダークウェブアドレス -> inazumimagwzqyacpudr6fod2ekjlxqog3o57xyqakpldxxfow3jgkad[.]onion",
  ];
}

function renderCatLines() {
  const voices = ["ニャン", "ミャー", "にゃーん", "みゃっ", "にゃ。"];

  return [
    " /\\_/\\",
    "( o.o )",
    " > ^ <",
    `${colors.muted}${randomItem(voices)}${colors.reset}`,
  ];
}

function renderTouchLines() {
  return [
    "...呼吸を止めて1秒  あなた真剣な目をしたから　そこから何も聞けなくなるの　星屑ロンリネス",
  ];
}

function renderSshLines(commandText) {
  if (commandText) {
    return ["シーッ！🤫静かにしてください！！！"];
  }

  return ["シーッ！🤫"];
}

function renderPsLines() {
  return [
    `${colors.yellow}  PID USER     STAT TIME COMMAND${colors.reset}`,
    "    1 root     Ss   0:01 init",
    "   89 root     S    0:00 journald",
    "  216 systemd  Ssl  0:00 resolved",
    "  421 inazumi  S+   0:04 zsh -l",
    "  422 inazumi  Sl+  0:06 xterm-renderer",
    "  423 inazumi  S+   0:00 makoto-aa-cache",
    `  424 inazumi  S+   0:00 ${colors.green}makotrain --home${colors.reset}`,
    `${colors.muted}7 processes, 1 terminal, 0 excuses.${colors.reset}`,
  ];
}

function renderSudoLines(commandText) {
  const message = commandText
    ? "須藤です。頑張ります。"
    : "こんにちは須藤（すどう）です。";

  return [
    "  _____",
    " /     \\",
    "| o   o |",
    "|   -   |",
    " \\_____/",
    `${colors.muted}${message}${colors.reset}`,
  ];
}

function renderManLines() {
  return [
    "   O",
    "  /|\\",
    "  / \\",
    `${colors.muted}男です。${colors.reset}`,
  ];
}

function renderGrepLines() {
  return [
    "     __",
    "   _/  \\_",
    "  ( o  o )",
    "   ( o o )",
    "    ( o )",
    "     \\_/",
    `${colors.muted}ぶどうです。${colors.reset}`,
  ];
}

function renderCdLines(discName) {
  const notes = ["♪", "♫", "♬", "♩", "♭"];
  const playing = discName || "compact disc";

  return [
    `${colors.cyan}${randomItem(notes)}${colors.reset}    ${colors.green}${randomItem(notes)}${colors.reset}       ${colors.cyan}${randomItem(notes)}${colors.reset}`,
    "    _______",
    "  .'  ___  '.",
    " /  .'   '.  \\",
    "|  |  CD  |  |",
    " \\  '.___.'  /",
    "  '._______.'",
    `${colors.muted}${randomItem(notes)} 再生中: ${playing} ${randomItem(notes)}${colors.reset}`,
  ];
}

function printLines(lines) {
  for (const line of lines) {
    writeln(line);
  }
}

function logoAvailableWidth() {
  const styles = window.getComputedStyle(logoHeader);

  return Math.max(
    1,
    logoHeader.clientWidth -
      Number.parseFloat(styles.paddingLeft) -
      Number.parseFloat(styles.paddingRight),
  );
}

function measureLogoLayout() {
  const availableWidth = logoAvailableWidth();
  const trainWidth = Math.max(
    1,
    ...Array.from(logoArt.querySelectorAll(".logo-train-line")).map((line) => line.scrollWidth),
  );
  const railRoom = Math.min(72, Math.max(28, availableWidth * 0.11));
  const logicalWidth =
    availableWidth >= trainWidth ? availableWidth : trainWidth + railRoom * 2;
  const scale = Math.min(1, availableWidth / logicalWidth);

  return { logicalWidth, scale };
}

function trainLines() {
  return Array.from(logoArt.querySelectorAll(".logo-train-line"));
}

function trainWidthPx() {
  return Math.max(1, ...trainLines().map((line) => line.scrollWidth));
}

function trainCharWidthPx() {
  const { body } = renderBanner();

  return trainWidthPx() / Math.max(...body.map((line) => line.length));
}

function currentLogoWidthPx() {
  return Number.parseFloat(logoScale.style.width) || measureLogoLayout().logicalWidth;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function updateRailMask(trainLeft, trainWidth, logoWidth) {
  const leftWidth = clamp(trainLeft, 0, logoWidth);
  const rightStart = clamp(trainLeft + trainWidth, 0, logoWidth);
  const rightWidth = Math.max(0, logoWidth - rightStart);

  for (const row of logoArt.querySelectorAll(".logo-rail-row")) {
    const leftRail = row.querySelector(".logo-rail-left");
    const rightRail = row.querySelector(".logo-rail-right");
    const rightTrack = rightRail.querySelector(".logo-rail-track");

    leftRail.style.width = `${leftWidth}px`;
    rightRail.style.left = `${rightStart}px`;
    rightRail.style.width = `${rightWidth}px`;
    rightTrack.style.left = `${-rightStart}px`;
  }
}

function positionTrain(offsetPx = trainOffsetPx) {
  const logoWidth = currentLogoWidthPx();
  const width = trainWidthPx();
  const homeLeft = Math.max(0, (logoWidth - width) / 2);
  const trainLeft = homeLeft + offsetPx;

  trainOffsetPx = offsetPx;

  for (const line of trainLines()) {
    line.style.left = `${trainLeft}px`;
  }

  updateRailMask(trainLeft, width, logoWidth);
}

function updateLogoScale() {
  if (!logoHeader.classList.contains("is-visible")) return;

  logoScale.style.transform = "scale(1)";
  logoScale.style.height = "auto";
  logoScale.style.width = "100%";

  const { logicalWidth, scale } = measureLogoLayout();
  logoScale.style.width = `${logicalWidth}px`;
  logoScale.style.transform = `scale(${scale})`;
  logoScale.style.height = `${logoArt.scrollHeight * scale}px`;
  positionTrain(trainOffsetPx);
}

function createLogoLine(text) {
  const row = document.createElement("div");
  const line = document.createElement("pre");

  row.className = "logo-row logo-body-row";
  line.className = "logo-train-line";
  line.textContent = text;
  row.append(line);

  return row;
}

function createRailLine(text, railText) {
  const row = document.createElement("div");
  const leftRail = document.createElement("span");
  const leftTrack = document.createElement("span");
  const train = document.createElement("pre");
  const rightRail = document.createElement("span");
  const rightTrack = document.createElement("span");
  const rail = railText.repeat(40);

  row.className = "logo-row logo-rail-row";
  leftRail.className = "logo-rail-segment logo-rail-left";
  leftTrack.className = "logo-rail-track";
  train.className = "logo-train-line";
  rightRail.className = "logo-rail-segment logo-rail-right";
  rightTrack.className = "logo-rail-track";
  leftTrack.textContent = rail;
  train.textContent = text;
  rightTrack.textContent = rail;
  leftRail.append(leftTrack);
  rightRail.append(rightTrack);
  row.append(leftRail, rightRail, train);

  return row;
}

function renderLogoArt() {
  const { body, railTop, railBottom } = renderBanner();

  logoArt.replaceChildren(
    createLogoLine(body[0]),
    createLogoLine(body[1]),
    createLogoLine(body[2]),
    createLogoLine(body[3]),
    createRailLine(body[4], railTop),
    createRailLine(body[5], railBottom),
  );
  trainOffsetPx = 0;
  positionTrain(0);
}

function resetTrainPosition() {
  positionTrain(0);
}

async function animateTrain() {
  if (trainRunning) return false;

  trainRunning = true;

  try {
    updateLogoScale();
    resetTrainPosition();

    if (reducedMotion) {
      await delay(180);
      return true;
    }

    const logoWidth = currentLogoWidthPx();
    const trainWidth = trainWidthPx();
    const step = trainCharWidthPx();
    const homeLeft = Math.max(0, (logoWidth - trainWidth) / 2);
    const gap = step * 8;
    const exitLeft = -(homeLeft + trainWidth + gap);
    const enterRight = logoWidth - homeLeft + gap;
    const stepDelay = window.innerWidth <= 520 ? 82 : 68;

    for (let offset = 0; offset >= exitLeft; offset -= step) {
      positionTrain(offset);
      await delay(stepDelay);
    }

    positionTrain(exitLeft);
    await delay(780);
    positionTrain(enterRight);
    await delay(420);

    for (let offset = enterRight; offset >= 0; offset -= step) {
      positionTrain(offset);
      await delay(stepDelay);
    }

    positionTrain(0);
    return true;
  } finally {
    resetTrainPosition();
    trainRunning = false;
  }
}

function showShellHeader() {
  renderLogoArt();
  logoHeader.classList.add("is-visible");
  logoHeader.removeAttribute("aria-hidden");
  terminalFrame.classList.add("is-ready");
  updateLogoScale();
  requestAnimationFrame(() => fitAddon.fit());
}

function hideShellHeader() {
  resetTrainPosition();
  logoHeader.classList.remove("is-visible");
  logoHeader.setAttribute("aria-hidden", "true");
  terminalFrame.classList.remove("is-ready");
  requestAnimationFrame(() => fitAddon.fit());
}

function clearCommandArea() {
  clearTerminal();
  showShellHeader();
}

async function runTrainCommand() {
  if (trainRunning) {
    writeln(`${colors.yellow}makotrain: すでに走行中です。${colors.reset}`);
    return;
  }

  shellState = "animating";
  term.options.disableStdin = true;

  try {
    writeln(`${colors.green}makotrain:${colors.reset} 出発します。`);
    await animateTrain();
    writeln(`${colors.green}makotrain:${colors.reset} 到着しました。`);
  } finally {
    resetTrainPosition();
    shellState = "ready";
    term.options.disableStdin = false;
  }
}

async function runCommand(rawCommand) {
  const command = rawCommand.trim();

  if (!command) {
    writePrompt();
    return;
  }

  history.push(command);
  historyIndex = history.length;

  const [name = ""] = command.split(/\s+/);
  const rest = command.slice(name.length).trim();

  switch (name) {
    case "clear":
      clearCommandArea();
      writePrompt();
      return;
    case "help":
      printLines(renderHelpLines());
      break;
    case "cd":
      printLines(renderCdLines(rest));
      break;
    case "cat":
      printLines(renderCatLines());
      break;
    case "touch":
      printLines(renderTouchLines());
      break;
    case "ssh":
      printLines(renderSshLines(rest));
      break;
    case "sudo":
      printLines(renderSudoLines(rest));
      break;
    case "ps":
      printLines(renderPsLines());
      break;
    case "ping":
      writeln("pong");
      break;
    case "man":
      printLines(renderManLines());
      break;
    case "grep":
      printLines(renderGrepLines());
      break;
    case "whoami":
      printLines(renderWhoamiLines());
      break;
    case "ls":
    case "sl":
      await runTrainCommand();
      break;
    case "exit":
      writeln("ダメです");
      break;
    default:
      writeln(`${colors.red}${name}: コマンドが見つかりません。help で確認してください。${colors.reset}`);
  }

  writePrompt();
}

function handlePrintableData(data) {
  for (const char of data) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) continue;
    inputBuffer += char;
    write(char);
  }
}

function handleTab() {
  const match = commands.find((item) => item.startsWith(inputBuffer.trim()));
  if (match) replaceInput(match);
}

function handleHistory(direction) {
  if (!history.length) return;
  historyIndex += direction;
  historyIndex = Math.max(0, Math.min(history.length, historyIndex));
  replaceInput(history[historyIndex] ?? "");
}

term.onData((data) => {
  if (shellState !== "ready") return;

  if (data === "\r") {
    writeln();
    const command = inputBuffer;
    inputBuffer = "";
    runCommand(command);
    return;
  }

  if (data === "\x7f") {
    if (inputBuffer.length) {
      inputBuffer = inputBuffer.slice(0, -1);
      write("\b \b");
    }
    return;
  }

  if (data === "\x0c") {
    clearCommandArea();
    writePrompt();
    return;
  }

  if (data === "\t") {
    handleTab();
    return;
  }

  if (data === "\x1b[A") {
    handleHistory(-1);
    return;
  }

  if (data === "\x1b[B") {
    handleHistory(1);
    return;
  }

  handlePrintableData(data);
});

async function renderBootFlow() {
  shellState = "booting";
  term.options.disableStdin = true;
  hideShellHeader();
  setIdentity("ようこそこんにちは");

  await delay(260);
  writePrompt();
  await delay(260);
  await typeAnimated("inazumi");
  await delay(140);
  writeln();
  await delay(80);

  const bootPhases = [
    {
      title: "起動段階 0: firmware / kernel",
      clearAfter: true,
      entries: [
        "OVMF firmware 2026.02 を初期化しています",
        "QEMU Standard PC (Q35 + ICH9, 2009) を検出しています",
        "SMBIOS 3.6.0 entry point at 0x000f05b0 を読み取っています",
        "ACPI: RSDP 0x00000000000F58D0 を検出しています",
        { type: "info", text: "Hypervisor detected: KVM" },
        ...bootBatch("firmware", [
          "CPU0: Intel Core Processor (host-passthrough) を online にしています",
          "x86/fpu: xstate_offset[2]: 576, xstate_sizes[2]: 256",
          "e820: usable memory region 0000000000100000-0000000003ffffff",
          "NUMA: Faking a node at [mem 0x0000000000000000-0x0000000003ffffff]",
          "tsc: Detected 2592.000 MHz processor",
          "clocksource: refined-jiffies: mask: 0xffffffff max_cycles: 0xffffffff",
          "pci 0000:00:00.0: [8086:29c0] type 00 class 0x060000",
          "pci 0000:00:01.0: [1b36:0008] type 01 class 0x060400",
          "pci 0000:00:02.0: [1af4:1050] type 00 class 0x030000",
          "pci 0000:00:03.0: [1af4:1042] type 00 class 0x018000",
          "pci 0000:00:04.0: [1af4:1043] type 00 class 0x078000",
          "pci 0000:00:05.0: [1af4:1044] type 00 class 0x020000",
          "pci_bus 0000:00: root bus resource [io  0x0000-0x0cf7]",
          "pci_bus 0000:00: root bus resource [mem 0x80000000-0xfebfffff]",
          "ACPI: PCI Root Bridge [PCI0] (domain 0000 [bus 00-ff])",
          "ACPI: Interpreter enabled",
          "ACPI: PM-Timer IO Port: 0x608",
          "ACPI: LAPIC_NMI (acpi_id[0x01] high edge lint[0x1])",
          "smpboot: Allowing 1 CPUs, 0 hotplug CPUs",
          "kvm-clock: Using msrs 4b564d01 and 4b564d00",
          "kvm-clock: using sched offset of 512 cycles",
          "clocksource: kvm-clock: mask: 0xffffffffffffffff",
          "random: crng init done",
          "Freeing SMP alternatives memory: 48K",
          "Kernel command line を EFI stub から受け取っています",
        ]),
        { type: "plain", text: "Linux version 6.8.12-inazumi (builder@vmhost) #1 SMP PREEMPT_DYNAMIC x86_64" },
        ...bootBatch("kernel", [
          "Command line: BOOT_IMAGE=/vmlinuz-linux root=UUID=3f78-1a2c rw console=ttyS0 loglevel=4",
          "x86/mm: Memory block size: 128MB",
          "Memory: 54752K/65536K available",
          "SLUB: HWalign=64, Order=0-3, MinObjects=0, CPUs=1, Nodes=1",
          "rcu: Hierarchical RCU implementation.",
          "rcu: RCU restricting CPUs from NR_CPUS=320 to nr_cpu_ids=1.",
          "smp: Bringing up secondary CPUs ...",
          "smp: Brought up 1 node, 1 CPU",
          "devtmpfs: initialized",
          "NET: Registered PF_NETLINK/PF_ROUTE protocol family",
          "audit: initializing netlink subsys (disabled)",
          "thermal_sys: Registered thermal governor 'step_wise'",
          "PCI: Using configuration type 1 for base access",
          "HugeTLB: registered 2.00 MiB page size, pre-allocated 0 pages",
          "iommu: Default domain type: Translated",
          "SCSI subsystem initialized",
          "libata version 3.00 loaded.",
          "pps_core: LinuxPPS API ver. 1 registered",
          "PTP clock support registered",
          "dmi: Firmware registration successful",
          "Serial: 8250/16550 driver, 4 ports, IRQ sharing enabled",
          "00:03: ttyS0 at I/O 0x3f8 (irq = 4, base_baud = 115200) is a 16550A",
          "rtc_cmos 00:04: registered as rtc0",
          "virtio-pci 0000:00:02.0: enabling device (0000 -> 0003)",
          "virtio-pci 0000:00:03.0: enabling device (0000 -> 0003)",
          "virtio_blk virtio0: 1/0/0 default/read/poll queues",
          "virtio_blk virtio0: [vda] 4194304 512-byte logical blocks",
          "virtio_net virtio1 eth0: renamed from ens5",
          "virtio_console virtio2: console [hvc0] enabled",
          "input: QEMU Virtio Keyboard as /devices/pci0000:00/0000:00:04.0/input/input0",
          "input: QEMU Virtio Mouse as /devices/pci0000:00/0000:00:04.0/input/input1",
          "fbcon: virtio frame buffer device registered",
          "EXT4-fs (vda1): mounted filesystem with ordered data mode",
          "VFS: Mounted root (ext4 filesystem) readonly on device 254:1.",
        ]),
        { type: "wait", text: "waiting for device /dev/disk/by-uuid/3f78-1a2c", pause: 520 },
        ...bootBatch("kernel", [
          "devtmpfs: mounted",
          "Freeing unused decrypted memory: 2040K",
          "Freeing unused kernel image memory: 4096K",
          "Write protecting the kernel read-only data: 28672k",
          "Run /sbin/init as init process",
          "sched_clock: Marking stable",
          "clocksource: Switched to clocksource kvm-clock",
          "audit: type=2000 audit(0.612:1): state=initialized audit_enabled=0 res=1",
          "systemd[1]: Inserted module 'autofs4'",
          "systemd[1]: systemd 255.6-1 running in system mode.",
          "systemd[1]: Detected virtualization kvm.",
          "systemd[1]: Detected architecture x86-64.",
          "systemd[1]: Hostname set to <inazumi>.",
        ]),
        { type: "plain", text: "systemd[1]: Queued start job for default target inazumi-terminal.target." },
        "Reached target Slice Units",
        "Reached target Swaps",
        "Reached target Local File Systems (Pre)",
        "Reached target Initrd Root Device",
        { type: "info", text: "Switching root to /sysroot" },
      ],
    },
    {
      title: "起動段階 1: initramfs / systemd / terminal",
      clearAfter: false,
      entries: [
        "initrd-switch-root.service を開始しています",
        "root filesystem を read-write remount しています",
        "systemd-journald.service を開始しています",
        "systemd-udevd.service を開始しています",
        { type: "info", text: "systemd[1]: Reached target Basic System." },
        ...bootBatch("systemd", [
          "Started Journal Service.",
          "Started udev Kernel Device Manager.",
          "Started Remount Root and Kernel File Systems.",
          "Started Create Static Device Nodes in /dev.",
          "Started Apply Kernel Variables.",
          "Started Load Kernel Modules.",
          "Started Coldplug All udev Devices.",
          "Reached target Preparation for Local File Systems.",
          "Reached target Local File Systems.",
          "Started Flush Journal to Persistent Storage.",
          "Started Create Volatile Files and Directories.",
          "Started Rebuild Dynamic Linker Cache.",
          "Started Update UTMP about System Boot/Shutdown.",
          "Started Network Configuration.",
          "Reached target Network.",
          "Reached target Network is Online.",
          "Started D-Bus System Message Bus.",
          "Started User Login Management.",
          "Started Hostname Service.",
          "Started Time Synchronization.",
          "Started Virtual Console Setup.",
          "Started Load/Save Random Seed.",
          "Started File System Check on Root Device.",
          "Started File System Check on /dev/disk/by-label/HOME.",
          "Mounted /home.",
          "Mounted /var/log.",
          "Mounted /tmp.",
          "Reached target Remote File Systems.",
          "Reached target System Initialization.",
          "Started Daily Cleanup of Temporary Directories.",
          "Reached target Timer Units.",
          "Reached target Path Units.",
          "Listening on D-Bus System Message Bus Socket.",
          "Listening on Journal Socket.",
          "Listening on udev Control Socket.",
          "Listening on udev Kernel Socket.",
        ]),
        "systemd-remount-fs.service を完了しています",
        "systemd-tmpfiles-setup-dev.service を完了しています",
        "systemd-sysctl.service を完了しています",
        { type: "plain", text: "systemd[1]: Activated swap /dev/zram0." },
        "zram0: detected capacity change from 0 to 131072",
        "zram0: setup algorithm lz4",
        "systemd-udevd[121]: Using default interface naming scheme 'v255'.",
        { type: "wait", text: "systemd-udev-settle.service: waiting for virtio devices", pause: 620 },
        "udev: vda: vda1 vda2",
        "udev: eth0: link becomes ready",
        "udev: hvc0: console device registered",
        "udev: input0: keyboard device ready",
        "udev: input1: pointer device ready",
        { type: "plain", text: "drm: virtio_gpu initialized" },
        "fb0: switching to virtio from EFI VGA",
        "tty1: virtual console bound",
        "ttyS0: serial console bound",
        "ptmx: Unix98 ptys enabled",
        { type: "warn", text: "eth0: carrier not detected; continuing with local console", pause: 360 },
        "loop: module loaded",
        "EXT4-fs (vda2): mounted filesystem with ordered data mode",
        "EXT4-fs (vda2): re-mounted. Opts: errors=remount-ro",
        { type: "plain", text: "systemd-fsck[183]: /dev/vda2: clean, 423/32768 files, 8184/131072 blocks" },
        "systemd-fsck[184]: /dev/vda1: clean, 189/16384 files, 4096/65536 blocks",
        "systemd-journald[89]: Received client request to flush runtime journal.",
        "systemd-resolved[216]: Positive Trust Anchors loaded.",
        "NetworkManager[231]: device eth0 state change: unmanaged -> unavailable",
        "NetworkManager[231]: manager: startup complete",
        "systemd[1]: Reached target Host and Network Name Lookups.",
        "systemd[1]: Reached target Network is Online.",
        "cloud-init-local.service を開始しています",
        "/home/inazumi のマウント準備を開始しています",
        "/home/inazumi をマウントしています",
        ...bootBatch("systemd-fsck", [
          "/dev/vda2: recovering journal",
          "/dev/vda2: clean, 23891/262144 files, 184921/1048576 blocks",
          "/dev/vda1: clean, 642/65536 files, 19648/262144 blocks",
          "Pass 1: Checking inodes, blocks, and sizes",
          "Pass 2: Checking directory structure",
          "Pass 3: Checking directory connectivity",
          "Pass 4: Checking reference counts",
          "Pass 5: Checking group summary information",
          "journal checksum valid",
          "orphan inode list cleared",
          "root directory inode verified",
          "lost+found directory verified",
          "quota files skipped",
          "extent tree depth verified",
          "inode bitmap differences: none",
          "block bitmap differences: none",
          "free blocks count verified",
          "free inodes count verified",
          "filesystem features: has_journal ext_attr resize_inode dir_index extent",
          "filesystem state: clean",
          "mounted /home with data=ordered",
          "mounted /home/inazumi with rw,nosuid,nodev,relatime",
          "created /run/user/1000",
          "created /run/inazumi-terminal",
          "updated /run/systemd/units/inazumi-terminal.service",
          "updated /run/systemd/units/xterm-renderer.service",
          "updated /run/systemd/units/terminal-help.service",
          "updated /run/systemd/units/terminal-cat-aa.service",
          "updated /run/systemd/units/terminal-sudo.service",
          "updated /run/systemd/units/terminal-ls-train.service",
          "updated /run/systemd/units/terminal-sl-train.service",
          "updated /run/systemd/units/terminal-man.service",
          "updated /run/systemd/units/terminal-grep-grape.service",
          "updated /run/systemd/units/terminal-whoami.service",
          "updated /run/systemd/units/terminal-cd.service",
          "restored context for /home/inazumi",
          "restored context for /home/inazumi/.zshrc",
          "restored context for /home/inazumi/.profile",
          "restored context for /home/inazumi/.cache",
          "wrote /run/systemd/generator/inazumi-terminal.target",
          "wrote /run/systemd/generator/terminal-command-registry.service",
          "wrote /run/systemd/generator/xterm-renderer.service",
          "wrote /run/systemd/generator/terminal-aa-cache.service",
          "updated /etc/mtab",
          "updated /run/systemd/mount-rootfs",
          "updated /run/systemd/generator",
          "udevadm settle completed",
          "journal catalog database rebuilt",
          "ldconfig cache updated",
          "machine-id committed",
          "hostname committed",
          "locale archive verified",
          "pam environment loaded",
          "system bus policy loaded",
          "tmpfiles rules applied",
          "login records initialized",
          "user-runtime-dir@1000.service queued",
          "getty@tty1.service queued",
          "serial-getty@ttyS0.service queued",
          "user@1000.service queued",
          "inazumi-terminal.service queued",
          "inazumi-terminal.target queued",
        ]),
        { type: "plain", text: "cloud-init[312]: Cloud-init v. 24.4 running 'init-local' at Thu, 04 Jun 2026 21:38:20 +0900" },
        "cloud-init: Reading datasource NoCloud from /var/lib/cloud/seed/nocloud",
        "cloud-init: Applying network config version 2",
        "cloud-init: Setting hostname to inazumi",
        "cloud-init: Generating /etc/machine-id",
        "cloud-init: Writing authorized keys for inazumi",
        "cloud-init: Expanding /dev/vda2 to fill device",
        "cloud-init: Growpart resized partition 2",
        "cloud-init: Resizing ext4 filesystem on /dev/vda2",
        { type: "info", text: "cloud-init[312]: Datasource DataSourceNoCloud initialized." },
        "systemd[1]: Started OpenSSH Server.",
        "systemd[1]: Started Permit User Sessions.",
        "systemd[1]: Started Getty on tty1.",
        "systemd[1]: Started Serial Getty on ttyS0.",
        "systemd[1]: Started User Runtime Directory /run/user/1000.",
        { type: "wait", text: "xterm-renderer.service: waiting for first paint", pause: 480 },
        "systemd[1]: Started User Manager for UID 1000.",
        "systemd[1]: Started Session 1 of User inazumi.",
        "systemd[1]: Reached target Login Prompts.",
        "systemd[1]: Reached target Multi-User System.",
        "systemd[1]: Started inazumi-profile.service.",
        "systemd[1]: Started inazumi-dotfiles.service.",
        "systemd[1]: Started inazumi-terminal-font.service.",
        "systemd[1]: Started inazumi-terminal-theme.service.",
        "systemd[1]: Started inazumi-command-registry.service.",
        "systemd[1]: Started inazumi-shell.service.",
        "systemd[1]: Started xterm-renderer.service.",
        "systemd[1]: Started xterm-fit-addon.service.",
        "systemd[1]: Started xterm-keyboard.service.",
        "systemd[1]: Started xterm-scrollback.service.",
        "systemd[1]: Started xterm-cursor.service.",
        { type: "plain", text: "systemd[1]: Startup finished in 612ms (kernel) + 4.288s (userspace) = 4.900s." },
        "systemd[1]: Started xterm-focus.service.",
        ...bootBatch("terminal", [
          "Environment=TERM=xterm-256color を適用しています",
          "WorkingDirectory=/home/inazumi を適用しています",
          "ExecStart=/usr/bin/zsh -l を検証しています",
          "RuntimeDirectory=inazumi-terminal を作成しています",
          "StateDirectory=inazumi-terminal exists",
          "StandardInput=tty を接続しています",
          "StandardOutput=tty を接続しています",
          "StandardError=journal+console を接続しています",
          "TTYPath=/dev/pts/0 を割り当てています",
          "TTYReset=yes を適用しています",
          "TTYVHangup=yes を適用しています",
          "KillMode=process を適用しています",
          "Restart=no を適用しています",
          "PrivateTmp=yes を適用しています",
          "ProtectSystem=strict を適用しています",
          "ProtectHome=read-only を適用しています",
          "NoNewPrivileges=yes を適用しています",
          "CapabilityBoundingSet= を適用しています",
          "RestrictNamespaces=yes を適用しています",
          "MemoryDenyWriteExecute=yes を適用しています",
          "ReadWritePaths=/run/inazumi-terminal を適用しています",
          "zsh login shell を生成しています",
          ".zprofile を読み込んでいます",
          ".zshrc を読み込んでいます",
          ".aliases を読み込んでいます",
          ".prompt を読み込んでいます",
          "help command を登録しています",
          "clear command を登録しています",
          "cat command を登録しています",
          "sudo command を登録しています",
          "ls command を登録しています",
          "sl command を登録しています",
          "man command を登録しています",
          "grep command を登録しています",
          "whoami command を登録しています",
          "cd command を登録しています",
          "AA banner を page cache に配置しています",
          "command help を page cache に配置しています",
          "ready prompt を生成しています",
        ]),
        "systemd[1]: Started terminal-cat-aa.service.",
        "systemd[1]: Started terminal-sudo.service.",
        "systemd[1]: Started terminal-ls-train.service.",
        "systemd[1]: Started terminal-sl-train.service.",
        "systemd[1]: Started terminal-man.service.",
        "systemd[1]: Started terminal-grep-grape.service.",
        "systemd[1]: Started terminal-whoami.service.",
        "systemd[1]: Started terminal-help.service.",
        "systemd[1]: Started terminal-clear.service.",
        "systemd[1]: Started terminal-cd.service.",
        "systemd[1]: Started terminal-command-registry.service.",
        "systemd[1]: Started terminal-aa-cache.service.",
        "systemd[1]: Started terminal-help-cache.service.",
        "systemd[1]: Started terminal-ready-prompt.service.",
        { type: "warn", text: "systemd[1]: eth0 remains offline; console target is active", pause: 420 },
        "systemd[1]: Reached target Login Prompts.",
        "systemd[1]: Reached target Multi-User System.",
        "systemd[1]: Reached target Graphical Interface.",
        "systemd[1]: Reached target inazumi-terminal.target.",
        { type: "plain", text: "inazumi-terminal[421]: attached to /dev/pts/0 as inazumi@home" },
        "inazumi-terminal[421]: loaded /home/inazumi/.zprofile",
        "inazumi-terminal[421]: loaded /home/inazumi/.zshrc",
        "inazumi-terminal[421]: loaded /home/inazumi/.prompt",
        "inazumi-terminal[421]: command registry ready",
        "inazumi-terminal[421]: banner cache ready",
        "inazumi-terminal[421]: help cache ready",
        "inazumi-terminal[421]: canonical input enabled",
        "inazumi-terminal[421]: cursor mode block",
        "inazumi-terminal[421]: scrollback limit 1600",
        "inazumi-terminal[421]: locale ja_JP.UTF-8",
        "inazumi-terminal[421]: TERM=xterm-256color",
        "inazumi-terminal[421]: startup complete",
        { type: "info", text: "systemd[1]: inazumi-terminal.target reached." },
        "Startup job queue is empty.",
        "Switching to interactive terminal session.",
        { type: "welcome", text: "おまたせしました！いってらっしゃい！", pause: 1000 },
      ],
    },
  ];

  for (const [index, phase] of bootPhases.entries()) {
    await runBootPhase(phase, index);
  }

  await delay(360);
  clearTerminal();
  await delay(120);

  promptHost = "inazumi@home";
  setIdentity(promptHost);

  showShellHeader();
  void animateTrain();
  await delay(240);
  printLines(renderHelpLines());
  writeln();

  history = [];
  historyIndex = 0;
  shellState = "ready";
  term.options.disableStdin = false;
  writePrompt();
  term.focus();
}

document.addEventListener("click", () => {
  term.focus();
});

renderBootFlow();
