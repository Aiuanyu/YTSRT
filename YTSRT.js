let player;
let subtitles = [];
let srtLoadMethod = ''; // 'url' or 'file'
let autoLoadFromUrlParams = false; // 新增標記，指示是否因 URL 參數而自動載入
let timeUpdateInterval = null;

const youtubeUrlInput = document.getElementById('youtube-url');
const srtUrlInput = document.getElementById('srt-url');
const srtFileInput = document.getElementById('srt-file');
const loadContentBtn = document.getElementById('load-content-btn');
const generateLinkBtn = document.getElementById('generate-link-btn');
const copyStatusMsg = document.getElementById('copy-status-msg');

// 頁面載入時清除檔案選擇 input，避免瀏覽器快取先前的值
if (srtFileInput) {
    srtFileInput.value = null;
}
const subtitleDisplayDiv = document.getElementById('subtitle-display');



// YouTube Iframe API
function onYouTubeIframeAPIReady() {
    console.log("YouTube API is ready.");
    // 如果是因 URL 參數觸發，且 API 已準備好，則執行載入
    if (autoLoadFromUrlParams) {
        console.log("URL parameters processed. API ready. Scheduling auto-load.");
        // 加入一個小延遲，嘗試避免與瀏覽器擴充功能可能的衝突
        // autoLoadFromUrlParams 標記會由 onPlayerReady 重設
        setTimeout(() => {
            console.log("Executing delayed auto-load via handleLoadContent.");
            handleLoadContent();
        }, 50); // 50毫秒延遲，可以根據需要調整
    }
}

function initializePlayer(videoId) {
    const playerContainer = document.getElementById('player');
    // 在建立播放器前，先取得容器計算後的實際闊度與高度
    // 容器的高度會由其闊度與 aspect-ratio 決定
    const computedWidth = playerContainer.clientWidth;
    const computedHeight = playerContainer.clientHeight;

    if (player) {
        player.loadVideoById(videoId);
        // 注意：loadVideoById 不會重新評估初始尺寸。
        // 若尺寸需要改變，可能需要銷毀並重建播放器。
    } else {
        player = new YT.Player('player', {
            height: String(computedHeight), // 使用容器計算後的高度
            width: String(computedWidth),   // 使用容器計算後的闊度
            videoId: videoId,
            playerVars: {
                'playsinline': 1
            },
            events: {
                'onReady': onPlayerReady,
                'onStateChange': onPlayerStateChange
            }
        });
    }
}

function onPlayerReady(event) {
    console.log('YT Player ready.');
    const playerInstance = event.target;

    // 如果是因 URL 參數自動載入，或者字幕已載入（手動載入情況），則嘗試播放
    if (autoLoadFromUrlParams || subtitles.length > 0) {
        const currentState = playerInstance.getPlayerState();
        if (currentState !== YT.PlayerState.PLAYING && currentState !== YT.PlayerState.BUFFERING) {
            console.log(`Player ready. autoLoadFromUrlParams: ${autoLoadFromUrlParams}, subtitles.length: ${subtitles.length}. Attempting to play video.`);
            playerInstance.playVideo();
        }

        // 如果是因 URL 參數自動載入且已處理播放，重設標記
        // 避免後續非自動載入的 onPlayerReady 事件錯誤地認為是自動載入
        if (autoLoadFromUrlParams) {
            autoLoadFromUrlParams = false;
            console.log("autoLoadFromUrlParams flag has been reset after onPlayerReady action.");
        }
    }
}
function onPlayerStateChange(event) {
    if (event.data === YT.PlayerState.PLAYING) {
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        timeUpdateInterval = setInterval(displayCurrentSubtitle, 200);
    } else {
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
    }
}

loadContentBtn.addEventListener('click', handleLoadContent);
srtUrlInput.addEventListener('input', () => {
    if (srtUrlInput.value.trim() !== '') {
        srtFileInput.value = ''; // Clear file input if URL is typed
        srtLoadMethod = 'url';
    }
});
srtFileInput.addEventListener('change', () => {
    if (srtFileInput.files.length > 0) {
        srtUrlInput.value = ''; // Clear URL input if file is selected
        srtLoadMethod = 'file';
    }
});

function handleLoadContent() {
    const youtubeUrl = youtubeUrlInput.value.trim();
    const videoId = getYouTubeVideoId(youtubeUrl);

    if (!videoId) {
        alert('請輸入有效的 YouTube 影片網址。');
        return;
    }

    subtitles = [];
    subtitleDisplayDiv.innerHTML = '';
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);

    initializePlayer(videoId);

    if (srtLoadMethod === 'url' && srtUrlInput.value.trim() !== '') {
        fetchSrtFromUrl(srtUrlInput.value.trim());
    } else if (srtLoadMethod === 'file' && srtFileInput.files.length > 0) {
        loadSrtFromFile(srtFileInput.files[0]);
    } else {
        console.log('未提供 SRT 字幕，僅播放影片。');
        if (player && player.playVideo) player.playVideo();
    }
}

function handleGenerateSharableLink() {
    const ytUrl = youtubeUrlInput.value.trim();
    if (!ytUrl) {
        alert('請先輸入 YouTube 影片網址。');
        return;
    }

    let sharableUrl = `${window.location.origin}${window.location.pathname}?yt=${encodeURIComponent(ytUrl)}`;

    const srtOnlineUrl = srtUrlInput.value.trim();
    if (srtLoadMethod === 'url' && srtOnlineUrl) {
        sharableUrl += `&srt=${encodeURIComponent(srtOnlineUrl)}`;
    } else if (srtLoadMethod === 'file' && srtFileInput.files.length > 0) {
        alert('本機 SRT 檔案無法附加在 URL 參數中。請上傳 SRT 檔案到網路空間並提供網址。');
        return;
    }

    navigator.clipboard.writeText(sharableUrl).then(() => {
        copyStatusMsg.style.display = 'inline';
        setTimeout(() => {
            copyStatusMsg.style.display = 'none';
        }, 2000); // 2 秒後隱藏訊息
    }).catch(err => {
        console.error('複製網址失敗:', err);
        alert('複製網址失敗，請手動複製。');
    });
}

if (generateLinkBtn) {
    generateLinkBtn.addEventListener('click', handleGenerateSharableLink);
}



function getYouTubeVideoId(url) {
    const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function fetchSrtFromUrl(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`無法載入 SRT 檔案: ${response.statusText}`);
        const srtContent = await response.text();
        parseAndSetSubtitles(srtContent);
    } catch (error) {
        console.error('從 URL 載入 SRT 失敗:', error);
        alert(`從 URL 載入 SRT 失敗: ${error.message}`);
    }
}

function loadSrtFromFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => parseAndSetSubtitles(e.target.result);
    reader.onerror = (e) => {
        console.error('讀取本機 SRT 檔案失敗:', e);
        alert('讀取本機 SRT 檔案失敗。');
    };
    reader.readAsText(file);
}

function parseAndSetSubtitles(srtContent) {
    try {
        const parsedSubtitles = parseSRT(srtContent);
        // 確保 parseSRT 返回一個陣列，即使是空的，或者拋出錯誤。
        if (!Array.isArray(parsedSubtitles)) throw new Error("SRT 解析未返回陣列。");
        parsedSubtitles.sort((a, b) => a.start - b.start);
        subtitles = parsedSubtitles; // 將解析後的字幕賦值給全域變數
        console.log('SRT 載入並解析完成:', subtitles.length, '條字幕');
        // 與播放器的互動（如開始播放或管理時間間隔）
        // 由 onPlayerReady 和 onPlayerStateChange 函數處理。
    } catch (error) {
        console.error('解析 SRT 內容失敗:', error);
        alert(`解析 SRT 內容失敗: ${error.message}`);
        subtitles = [];
    }
}

function timeStringToSeconds(timeString) {
    const parts = timeString.split(/[:,]/);
    if (parts.length !== 4) {
        if (parts.length === 3) parts.push("000"); // HH:MM:SS -> HH:MM:SS,ms
        else throw new Error(`無效的時間格式: "${timeString}"`);
    }
    const [h, m, s, ms] = parts.map(p => parseInt(p, 10));
    if ([h, m, s, ms].some(isNaN)) throw new Error(`無效的時間組件於 "${timeString}"`);
    return h * 3600 + m * 60 + s + ms / 1000;
}

function parseSRT(content) {
    const lines = content.replace(/\r\n/g, '\n').split('\n');
    const subs = [];
    for (let i = 0; i < lines.length; ) {
        const indexLine = lines[i]?.trim();
        if (!indexLine) { i++; continue; }

        if (!/^\d+$/.test(indexLine) && (!lines[i+1] || !lines[i+1].includes('-->'))) {
            console.warn(`SRT 解析警告: 跳過無效區塊，行 ${i + 1} 附近。`);
            while (i < lines.length && lines[i]?.trim() && !/^\d+$/.test(lines[i]?.trim())) i++;
            continue;
        }
        if (/^\d+$/.test(indexLine)) i++;

        const timeLine = lines[i]?.trim();
        if (!timeLine || !timeLine.includes('-->')) { i++; continue; }
        const timeParts = timeLine.split(' --> ');
        if (timeParts.length !== 2) { i++; continue; }

        let start, end;
        try {
            start = timeStringToSeconds(timeParts[0].trim());
            end = timeStringToSeconds(timeParts[1].trim());
            if (isNaN(start) || isNaN(end) || start > end) throw new Error("無效時間值或順序");
        } catch (e) { console.warn(`SRT 時間解析錯誤: ${e.message}, 行 ${i+1}`); i++; continue; }
        i++;

        let textLines = [];
        while (i < lines.length && lines[i]?.trim() !== '') {
            textLines.push(lines[i]);
            i++;
        }
        subs.push({ start, end, text: textLines.join('\n') });
        while (i < lines.length && lines[i]?.trim() === '') i++;
    }
    if (subs.length === 0 && content.trim() !== '') throw new Error("SRT 內容不為空，但未解析到字幕。");
    return subs;
}

function displayCurrentSubtitle() {
    if (!player || typeof player.getCurrentTime !== 'function' || subtitles.length === 0) {
        subtitleDisplayDiv.innerHTML = '&nbsp;<br>&nbsp;'; // 持續顯示，避免跳動
        return;
    }
    const currentTime = player.getCurrentTime();
    const activeSub = subtitles.find(sub => currentTime >= sub.start && currentTime < sub.end);
    subtitleDisplayDiv.innerHTML = activeSub ? activeSub.text.replace(/\n/g, '<br>') : '&nbsp;<br>&nbsp;'; // 持續顯示，避免跳動
}

// --- 處理 URL 參數並自動載入 ---
function processUrlParametersOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const ytVideoUrl = urlParams.get('yt');
    const srtFileUrl = urlParams.get('srt');

    if (ytVideoUrl) {
        youtubeUrlInput.value = decodeURIComponent(ytVideoUrl);
        autoLoadFromUrlParams = true;
    }
    if (srtFileUrl) {
        srtUrlInput.value = decodeURIComponent(srtFileUrl);
        srtLoadMethod = 'url'; // 確保 srtLoadMethod 設定正確
        if (srtFileInput) srtFileInput.value = ''; // 清除檔案選擇
        autoLoadFromUrlParams = true; // 如果有 srt 參數，也標記為自動載入
    }

    // 注意：這裡不再直接觸發 loadContentBtn.click()
    // 自動載入的邏輯移到 onYouTubeIframeAPIReady 中，確保 API 已準備好
    if (autoLoadFromUrlParams) {
        console.log("URL parameters processed. Auto-load will be handled by onYouTubeIframeAPIReady.");
    }
}

window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// 確保 DOM 完全載入後才執行 URL 參數處理，避免元素找不到
document.addEventListener('DOMContentLoaded', () => {
    processUrlParametersOnLoad();
    // 其他需要在 DOM 載入後執行的初始化程式碼可以放這裡
});