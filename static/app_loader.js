const EngineUI = {
    // 🚀 1. 로딩 오버레이 HTML 구조 통째로 주입
    init() {
        const loaderWrap = document.getElementById("app-loader");
        loaderWrap.innerHTML = `
      <div id="loading-overlay" class="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-theme-bg transition-opacity duration-1000">
        <div class="w-full max-w-md p-6 bg-theme-panel border border-theme-border rounded-xl shadow-2xl">
          <div class="text-center mb-8">
            <h1 class="text-2xl font-black text-theme-accent tracking-tighter mb-2 italic">SELLNANCE ENGINE</h1>
            <p class="text-[10px] opacity-50 uppercase tracking-[0.3em]">System Boot Sequence v1.0</p>
          </div>
          <div class="relative h-2 bg-theme-border rounded-full overflow-hidden mb-6">
            <div id="progress-bar" class="absolute h-full bg-theme-accent transition-all duration-500 w-0"></div>
          </div>
          <div class="flex justify-between items-end mb-4 px-1">
            <span class="text-[10px] font-bold opacity-70">CORE TRACING...</span>
            <span id="percent-text" class="text-2xl font-black text-theme-accent leading-none">0%</span>
          </div>
          <div id="status-list" class="space-y-1.5 text-[12px] font-medium max-h-72 overflow-y-auto pr-2 custom-scrollbar"></div>
        </div>
      </div>
    `;
    },

    // 🚀 2. 데이터 들어올 때마다 화면 갱신
    update(data) {
        const bar = document.getElementById("progress-bar");
        const text = document.getElementById("percent-text");
        const list = document.getElementById("status-list");

        if (bar) bar.style.width = `${data.percent}%`;
        if (text) text.innerText = `${data.percent}%`;

        if (list) {
            list.innerHTML = data.phases.map((name, i) => {
                const isDone = data.status[i].includes("완료");
                const isIng = data.status[i].includes("진행");
                return `
          <div class="flex justify-between items-center p-2.5 rounded bg-theme-border/10 border border-transparent ${isIng ? 'border-theme-accent/30 bg-theme-accent/5' : ''}">
            <span class="opacity-80">${i + 1}. ${name}</span>
            <span class="${isDone ? 'text-theme-accent' : isIng ? 'text-blue-400 animate-pulse' : 'opacity-30'} font-bold">
              ${isDone ? 'READY' : isIng ? 'RUNNING' : 'WAIT'}
            </span>
          </div>
        `;
            }).join("");
        }

        if (data.percent === 100) this.finish();
    },

    // 🚀 3. 로딩 완료 시 처리
    finish() {
        setTimeout(() => {
            const overlay = document.getElementById("loading-overlay");
            const main = document.getElementById("main-content");
            if (overlay) overlay.classList.add("opacity-0", "pointer-events-none");
            if (main) {
                main.classList.remove("hidden");
                setTimeout(() => main.classList.remove("opacity-0"), 50);
            }
            document.body.classList.remove("overflow-hidden");
        }, 1000);
    }
};

// 🚀 SSE 연결부 수정
const eventSource = new EventSource("/api/progress");
EngineUI.init(); // 시작하자마자 UI 주입

eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);
    EngineUI.update(data);
    if (data.percent === 100) eventSource.close();
};