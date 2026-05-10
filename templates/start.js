// 🚀 스타트뷰 엔진: 실시간 마스킹 + env 연동 + 유효성 검사
// 🚀 스타트뷰 엔진: 무한 확장 마스킹 버전
// 🚀 스타트뷰 엔진: 완전 가변형 마스킹 (글자수 무제한)

// 🚀 Start Screen HTML을 반환하는 함수
function getStartScreenHTML() {
  // 이전에 index.html에 있던 start-screen div 전체를 여기에 옮겨왔습니다.
  // 이전 대화에서 적용된 `items-start`와 `pt-16` 클래스도 유지됩니다.
  return `
    <div
      id="start-screen"
      class="fixed items-start inset-0 z-[1000] flex bg-theme-bg transition-opacity duration-500 pt-16"
    >
      <div
        id="start-background"
        class="absolute inset-0 z-0 pointer-events-none overflow-hidden"
      ></div>

      <div
        class="relative z-10 bg-theme-panel/80 border border-theme-border rounded-2xl shadow-[0_20px_60px_rgba(0,0,0,0.5)] p-8 w-[90%] max-w-md flex flex-col gap-6 text-center backdrop-blur-md"
      >
        <div>
          <h1
            class="text-4xl font-black text-theme-accent uppercase tracking-widest mb-2 drop-shadow-md"
          >
            sellance
          </h1>
          <p class="text-theme-text opacity-80 text-sm font-bold tracking-wide">
            Enter CMC API Key to initialize.
          </p>

          <div
            class="mt-3 py-2 px-3 bg-black/20 rounded-lg border border-white/5"
          >
            <p class="text-[11px] text-theme-text opacity-60 leading-relaxed">
              API 키가 없으신가요?
              <a
                href="https://coinmarketcap.com/api/pricing/"
                target="_blank"
                class="text-theme-accent font-bold underline hover:brightness-125 ml-1"
              >
                CoinMarketCap API Dashboard
              </a>
              에서 무료 키를 발급받을 수 있습니다.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <input
            type="text"
            id="cmc-api-input"
            placeholder="Paste your CMC API Key..."
            class="w-full bg-theme-bg text-theme-text border-2 border-theme-border px-4 py-3.5 rounded-xl text-center font-mono text-sm focus:outline-none focus:border-theme-accent transition-all shadow-inner"
            autocomplete="off"
            spellcheck="false"
          />

          <div class="flex flex-col gap-1 mt-1 px-1">
            <p class="text-[10px] text-theme-text opacity-40 text-left">
              * Key is securely stored in your local browser.
            </p>
            <p
              class="text-[10px] text-theme-accent/70 text-left font-bold italic"
            >
              ** 키가 없어도 Skip을 누르면 서버 캐시 데이터로 대시보드 진입이
              가능합니다.
            </p>
          </div>
        </div>

        <div class="flex flex-col gap-3 mt-2">
          <button
            onclick="saveAndStart()"
            class="w-full py-3.5 bg-theme-accent text-white font-black rounded-xl shadow-lg hover:brightness-110 active:scale-[0.98] transition-all tracking-widest uppercase"
          >
            Start Engine 🚀
          </button>
          <button
            onclick="skipAndStart()"
            class="w-full py-3 bg-transparent text-theme-text border border-theme-border font-bold rounded-xl hover:bg-white/5 active:scale-[0.98] transition-all tracking-wide opacity-50 hover:opacity-100"
          >
            Skip (Use Cached Data) ⏭️
          </button>
        </div>
      </div>
    </div>
    `;
}

let rawCmcKey = "";

function maskApiKey(key) {
  if (!key) return "";
  const len = key.length;
  if (len <= 8) return key; // 8자 이하는 노출

  // 9자 이상: 앞 4자 + (중간 글자수만큼 *) + 뒤 4자
  const start = key.slice(0, 4);
  const end = key.slice(-4);
  const dots = "*".repeat(len - 8);
  return `${start}${dots}${end}`;
}

async function showStartScreen() {
  // 함수 이름 변경
  // 🚀 Start Screen HTML을 body에 동적으로 추가
  document.body.insertAdjacentHTML("beforeend", getStartScreenHTML());

  const input = document.getElementById("cmc-api-input");

  // 1. 서버 환경변수(env)에서 키 가져오기 (확실히 올 때까지 기다림)
  try {
    console.log("📡 서버에서 env 키 조회 중...");
    const res = await fetch("/api/get-env-key");
    const data = await res.json();

    if (data.key && data.key.trim() !== "") {
      rawCmcKey = data.key;
      console.log("✅ env 키 로드 성공!");
    } else {
      // env에 없으면 로컬 스토리지 확인
      rawCmcKey = localStorage.getItem("CMC_API_KEY") || "";
      console.log("ℹ️ env에 키가 없어 로컬 스토리지를 확인했습니다.");
    }
  } catch (e) {
    console.error("🚨 서버 통신 실패, 로컬 스토리지로 대체합니다.");
    rawCmcKey = localStorage.getItem("CMC_API_KEY") || "";
  }

  // 2. 가져온 키가 있다면 "즉시" 인풋 박스에 마스킹해서 보여줌
  if (rawCmcKey) {
    input.value = maskApiKey(rawCmcKey);
  }

  // 🚀 수정된 부분: beforeinput 이벤트 핸들러
  input.addEventListener("beforeinput", (e) => {
    // 1. 글자 추가 시 (e.data가 존재할 때)
    if (e.data) {
      // 💡 [핵심] 영어와 숫자만 허용하는 정규식 검사
      const isAlphaNumeric = /^[a-zA-Z0-9]+$/.test(e.data);

      if (isAlphaNumeric) {
        rawCmcKey += e.data;
      } else {
        // 영어/숫자가 아니면 입력을 무시하고 튕겨냄
        e.preventDefault();
        return;
      }
    }
    // 2. 백스페이스(삭제) 시
    else if (e.inputType === "deleteContentBackward") {
      rawCmcKey = rawCmcKey.slice(0, -1);
    }
  });

  // 🚀 붙여넣기(Paste) 시에도 필터링하고 싶다면 input 이벤트 수정
  input.addEventListener("input", (e) => {
    const val = e.target.value;

    // 붙여넣기 대응: 마스킹 별표가 없는 경우 (통째로 새로 들어온 경우)
    if (!val.includes("*") && val !== "") {
      // 영어와 숫자만 남기고 나머지(한글, 특수문자 등) 싹 제거
      rawCmcKey = val.replace(/[^a-zA-Z0-9]/g, "");
    }

    // 화면에는 마스킹된 결과만 출력
    input.value = maskApiKey(rawCmcKey);
  });

  // 클릭 시 새로 입력 모드 (기존 유지)
  input.addEventListener("focus", () => {
    if (rawCmcKey) {
      input.value = "";
      rawCmcKey = ""; // 9글자 버그 방지를 위해 포커스 시 깔끔하게 비우고 시작
    }
  });

  input.addEventListener("blur", () => {
    input.value = maskApiKey(rawCmcKey);
  });
}

function saveAndStart() {
  const keyToSave = rawCmcKey.trim();
  // 🚨 32글자 철벽 검사
  if (keyToSave.length !== 32) {
    Swal.fire({
      icon: "error",
      title: "Invalid Key!",
      text: `CMC API 키는 정확히 32글자여야 합니다. (현재: ${keyToSave.length}자)`,
      background: "var(--panel)",
      color: "var(--text)",
      confirmButtonColor: "var(--accent)",
    });
    return;
  }
  localStorage.setItem("CMC_API_KEY", keyToSave);
  hideStartScreen();
}

// 🚀 Skip (쌀먹 모드 유지)
function skipAndStart() {
  console.log("⏭️ [스킵] 캐시 데이터로 진입합니다.");
  hideStartScreen();
}

function hideStartScreen() {
  const screen = document.getElementById("start-screen");
  if (screen) {
    screen.style.opacity = "0";
    setTimeout(() => (screen.style.display = "none"), 500);
  }
}

window.addEventListener("DOMContentLoaded", initStartScreen);

window.saveAndStart = saveAndStart;
window.skipAndStart = skipAndStart;
