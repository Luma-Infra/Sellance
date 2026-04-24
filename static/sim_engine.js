// sim_engine.js
// --- 🎮 시뮬레이터 수학 & 로직 ---
function changeDir(d) {
    const bodyInput = document.getElementById('input-body');
    if (curDir === 'bull') bullBody = bodyInput.value;
    else bearBody = bodyInput.value;

    curDir = d;

    const slider = document.getElementById('dir-slider');
    const btnBull = document.getElementById('dir-bull');
    const btnBear = document.getElementById('dir-bear');
    const btnGen = document.getElementById('btn-generate');

    if (d === 'bull') {
        bodyInput.max = 200;
        bodyInput.value = bullBody;
        if (slider) { slider.style.transform = 'translateX(0)'; slider.style.backgroundColor = 'var(--up)'; }
        if (btnBull) btnBull.style.color = 'white';
        if (btnBear) btnBear.style.color = 'var(--text)';
        if (btnGen) btnGen.style.backgroundColor = 'var(--up)';
    } else {
        bodyInput.max = 99;
        bodyInput.value = Math.min(bearBody, 99);
        if (slider) { slider.style.transform = 'translateX(100%)'; slider.style.backgroundColor = 'var(--down)'; }
        if (btnBull) btnBull.style.color = 'var(--text)';
        if (btnBear) btnBear.style.color = 'white';
        if (btnGen) btnGen.style.backgroundColor = 'var(--down)';
    }

    document.getElementById('val-body').innerText = bodyInput.value + '%';
    if (typeof updateStatus === 'function') updateStatus();
    if (isHover && typeof updatePreview === 'function') updatePreview();
}

function addCandle() {
    if (!mainData || !mainData.length) return;
    const n = getNext();
    mainData.push(n);
    candleSeries.setData(mainData);

    if (typeof updateStatus === 'function') updateStatus();
    if (typeof updateLegend === 'function') updateLegend(n);
    if (typeof updatePreview === 'function') updatePreview();
}

function undoLast() {
    if (mainData && mainData.length > 1) {
        mainData.pop();
        candleSeries.setData(mainData);

        const lastCandle = mainData[mainData.length - 1];
        if (typeof updateStatus === 'function') updateStatus();
        if (typeof updateLegend === 'function') updateLegend(lastCandle);
        if (isHover && typeof updatePreview === 'function') updatePreview();
        console.log("✅ Undo 완료. 현재 데이터 개수:", mainData.length);
    }
}

function getNext() {
    if (!mainData || !mainData.length) return { close: 0 };

    const last = mainData[mainData.length - 1];
    const o = last.close;

    let b = parseFloat(document.getElementById('input-body').value) / 100;
    const t = parseFloat(document.getElementById('input-top').value) / 100;
    const bt = parseFloat(document.getElementById('input-bottom').value) / 100;

    if (curDir === 'bear') b = Math.min(b, 0.99);

    const c = curDir === 'bull' ? o * (1 + b) : o * (1 - b);
    const highLimit = Math.max(o, c);
    const lowLimit = Math.min(o, c);
    const nextTime = last.time + (tfSec[currentTF] || 86400);

    return {
        time: nextTime,
        open: o,
        high: highLimit + (o * t),
        low: lowLimit - (o * bt),
        close: c
    };
}