let player;
let subtitles = [];
let srtLoadMethod = ''; // 'url' or 'file'
let autoLoadFromUrlParams = false; // 新增標記，指示是否因 URL 參數而自動載入
let detectedMaxLinesInSrt = 2; // 字幕區預計顯示的最大行數，預設2行
let timeUpdateInterval = null;
let startAtTimeFromUrl = null; // 從 URL 參數 't' 讀取到的起始秒數
let originalPageTitle = document.title; // 保存原始網頁標題

const youtubeUrlInput = document.getElementById('youtube-url');
const srtUrlInput = document.getElementById('srt-url');
const srtFileInput = document.getElementById('srt-file');
const loadContentBtn = document.getElementById('load-content-btn');
const generateLinkBtn = document.getElementById('generate-link-btn');
const shareTimeCheckbox = document.getElementById('share-time-checkbox');
const shareTimeInput = document.getElementById('share-time-input');
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
    updateBrowserStateAndTitle(playerInstance); // 更新標題與歷史紀錄

    let seekDoneDueToTParam = false;
    if (startAtTimeFromUrl !== null && typeof playerInstance.seekTo === 'function') {
        playerInstance.seekTo(startAtTimeFromUrl, true);
        console.log(`Player ready, seeking to ${startAtTimeFromUrl}s due to 't' URL parameter.`);
        seekDoneDueToTParam = true;
    }

    // 如果是因 URL 參數自動載入，或者字幕已載入（手動載入情況），則嘗試播放
    if (autoLoadFromUrlParams || subtitles.length > 0) {
        const currentState = playerInstance.getPlayerState();
        if (currentState !== YT.PlayerState.PLAYING && currentState !== YT.PlayerState.BUFFERING) {
            console.log(`Player ready. autoLoad: ${autoLoadFromUrlParams}, subs: ${subtitles.length}. Attempting to play.`);
            playerInstance.playVideo();
        }
        // 如果是因 URL 參數自動載入且已處理播放，重設標記
        if (autoLoadFromUrlParams) {
            autoLoadFromUrlParams = false;
            console.log("autoLoadFromUrlParams flag has been reset after onPlayerReady action.");
        }
    }

    if (shareTimeInput) { // 初始化分享時間輸入框
        shareTimeInput.value = formatSecondsToHMS(playerInstance.getCurrentTime() || 0);
    }

    if (seekDoneDueToTParam) { // 消耗 't' 參數，避免重複使用
        startAtTimeFromUrl = null;
    }
}
function onPlayerStateChange(event) {
    const playerInstance = event.target;
    if (event.data === YT.PlayerState.PLAYING) {
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        timeUpdateInterval = setInterval(displayCurrentSubtitle, 200);
        const videoData = playerInstance.getVideoData();
        if (videoData && videoData.title && !document.title.includes(videoData.title)) {
            updateBrowserStateAndTitle(playerInstance);
        }
    } else if (event.data === YT.PlayerState.UNSTARTED) {
        // UNSTARTED 狀態通常在 loadVideoById 後出現，這時影片資料應已可用
        updateBrowserStateAndTitle(playerInstance);
    } else {
        if (timeUpdateInterval) clearInterval(timeUpdateInterval);
        timeUpdateInterval = null;
        // 播放停止或暫停時，也更新一次分享時間輸入框
        if (shareTimeInput && playerInstance && typeof playerInstance.getCurrentTime === 'function') {
            if (document.activeElement !== shareTimeInput) { // 避免覆蓋使用者正在輸入的內容
                shareTimeInput.value = formatSecondsToHMS(playerInstance.getCurrentTime());
            }
        }
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
    detectedMaxLinesInSrt = 2; // 重設為預設值
    // 若 videoId 為空 (表示清空輸入或無效)，則重設標題和 URL
    if (!videoId) {
        updateBrowserStateAndTitle(null); // 傳入 null 來重設
    }
    if (shareTimeInput) { // 重設分享時間輸入框
        shareTimeInput.value = formatSecondsToHMS(0);
        if (shareTimeCheckbox) shareTimeCheckbox.checked = false;
    }
    updateSubtitleDisplayEmptyState(); // 更新字幕區為預設高度

    if (timeUpdateInterval) clearInterval(timeUpdateInterval);

    initializePlayer(videoId);

    if (srtLoadMethod === 'url' && srtUrlInput.value.trim() !== '') {
        fetchSrtFromUrl(srtUrlInput.value.trim());

    } else if (srtLoadMethod === 'file' && srtFileInput.files.length > 0) {
        loadSrtFromFile(srtFileInput.files[0]);
    } else {
        console.log('未提供 SRT 字幕，僅播放影片。');
        if (player && player.playVideo && videoId) { // 只有在有 videoId 時才播放
             player.playVideo();
        }
        // 如果 videoId 存在但無字幕，也更新瀏覽器狀態
        if (videoId && player) updateBrowserStateAndTitle(player);
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

    if (shareTimeCheckbox && shareTimeCheckbox.checked && shareTimeInput && shareTimeInput.value) {
        try {
            const seconds = timeStringToSecondsHMS(shareTimeInput.value.trim());
            if (!isNaN(seconds) && seconds >= 0) {
                sharableUrl += `&t=${seconds}`;
            }
        } catch (e) {
            console.warn("無法從分享時間輸入框解析時間:", e.message);
        }
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

        if (subtitles.length > 0) {
            let maxLines = 0;
            for (const sub of subtitles) {
                const linesInSub = (sub.text.match(/\n/g) || []).length + 1;
                if (linesInSub > maxLines) {
                    maxLines = linesInSub;
                }
            }
            detectedMaxLinesInSrt = Math.max(1, maxLines); // 至少顯示1行
        } else {
            detectedMaxLinesInSrt = 2; // 若無字幕，則恢復預設2行
        }
        console.log(`SRT 載入並解析完成: ${subtitles.length} 條字幕，偵測到最多 ${detectedMaxLinesInSrt} 行。`);

        // 立即更新字幕區的預留空白高度
        updateSubtitleDisplayEmptyState();

        // 與播放器的互動（如開始播放或管理時間間隔）
        // 由 onPlayerReady 和 onPlayerStateChange 函數處理。
    } catch (error) {
        console.error('解析 SRT 內容失敗:', error);
        alert(`解析 SRT 內容失敗: ${error.message}`);
        subtitles = [];
        detectedMaxLinesInSrt = 2; // 錯誤時恢復預設
        updateSubtitleDisplayEmptyState(); // 更新字幕區
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

// 更新字幕顯示區為空白佔位狀態
function updateSubtitleDisplayEmptyState() {
    if (subtitleDisplayDiv) {
        let placeholderText = '';
        if (detectedMaxLinesInSrt > 0) {
            // 產生 detectedMaxLinesInSrt 行的 &nbsp;，用 <br> 分隔
            placeholderText = Array.from({ length: detectedMaxLinesInSrt }, () => '&nbsp;').join('<br>');
        }
        subtitleDisplayDiv.innerHTML = placeholderText;
    }
}

function displayCurrentSubtitle() {
    if (!player || typeof player.getCurrentTime !== 'function' || subtitles.length === 0) {
        if (shareTimeInput && document.activeElement !== shareTimeInput && player && typeof player.getCurrentTime === 'function') {
             shareTimeInput.value = formatSecondsToHMS(player.getCurrentTime() || 0); // 即使無字幕也更新時間
        }
        updateSubtitleDisplayEmptyState();
        return;
    }
    const currentTime = player.getCurrentTime();
    const activeSub = subtitles.find(sub => currentTime >= sub.start && currentTime < sub.end);

    if (shareTimeInput && document.activeElement !== shareTimeInput) shareTimeInput.value = formatSecondsToHMS(currentTime);

    if (activeSub) {
        const textLinesArray = activeSub.text.split('\n');
        let displayText = textLinesArray.map(line => line.trim() === '' ? '&nbsp;' : line).join('<br>');
        const actualLines = textLinesArray.length;
        const linesToPad = detectedMaxLinesInSrt - actualLines;

        if (linesToPad > 0) {
            for (let i = 0; i < linesToPad; i++) {
                displayText += '<br>&nbsp;';
            }
        }
        subtitleDisplayDiv.innerHTML = displayText;
    } else {
        updateSubtitleDisplayEmptyState();
    }
}

// --- 更新網頁標題與瀏覽器歷史紀錄 ---
function updateBrowserStateAndTitle(playerInstance) {
    let videoTitle = '';
    const currentYtUrl = youtubeUrlInput.value.trim();

    if (playerInstance && typeof playerInstance.getVideoData === 'function' && currentYtUrl) {
        const videoData = playerInstance.getVideoData();
        videoTitle = videoData ? videoData.title : '';
    }

    const newPageTitle = (videoTitle && currentYtUrl) ? `[掛字幕] YT：${videoTitle}` : originalPageTitle;
    document.title = newPageTitle;

    let newUrlPathAndQuery = window.location.pathname;

    if (currentYtUrl) {
        newUrlPathAndQuery += `?yt=${encodeURIComponent(currentYtUrl)}`;
        const currentSrtUrl = srtUrlInput.value.trim();
        if (srtLoadMethod === 'url' && currentSrtUrl) {
            newUrlPathAndQuery += `&srt=${encodeURIComponent(currentSrtUrl)}`;
        }
    }
    // else: 如果 currentYtUrl 是空的，newUrlPathAndQuery 就只有 pathname，無參數

    const fullNewUrl = `${window.location.origin}${newUrlPathAndQuery}`;

    // 只有在 URL 實際改變時才 pushState，避免重複加入相同歷史紀錄
    if (window.location.href !== fullNewUrl) {
        try {
            window.history.pushState(
                { yt: currentYtUrl, srt: (srtLoadMethod === 'url' ? srtUrlInput.value.trim() : undefined) },
                newPageTitle,
                newUrlPathAndQuery
            );
            console.log("Browser history updated to:", newUrlPathAndQuery);
        } catch (e) {
            console.error("Error updating browser history:", e);
        }
    }
}

// --- 處理 URL 參數並自動載入 ---
function processUrlParametersOnLoad() {
    const urlParams = new URLSearchParams(window.location.search);
    const ytVideoUrl = urlParams.get('yt');
    const srtFileUrl = urlParams.get('srt');
    const timeParam = urlParams.get('t');

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
    if (timeParam) {
        const parsedTime = parseInt(timeParam, 10);
        if (!isNaN(parsedTime) && parsedTime >= 0) {
            startAtTimeFromUrl = parsedTime;
            // autoLoadFromUrlParams 應由 yt 或 srt 參數觸發，t 參數僅為時間點
            console.log(`URL 參數 't' 找到: ${startAtTimeFromUrl}s`);
        }
    }

    // 注意：這裡不再直接觸發 loadContentBtn.click()
    // 自動載入的邏輯移到 onYouTubeIframeAPIReady 中，確保 API 已準備好
    if (autoLoadFromUrlParams) {
        console.log("URL parameters processed. Auto-load will be handled by onYouTubeIframeAPIReady.");
    }
}

// --- 時間格式轉換輔助函數 ---
function formatSecondsToHMS(totalSecondsFloat) {
    const totalSeconds = Math.max(0, Math.floor(totalSecondsFloat));
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = Math.floor(totalSeconds % 60);

    const m_padded = String(m).padStart(2, '0');
    const s_padded = String(s).padStart(2, '0');

    return `${h}:${m_padded}:${s_padded}`; // 例如：0:05:32 或 1:05:32
}

function timeStringToSecondsHMS(hmsString) {
    const parts = hmsString.split(':').map(part => parseInt(part, 10));
    let seconds = 0;

    if (parts.some(isNaN)) throw new Error(`無效的時間組件 (H:MM:SS): "${hmsString}"`);

    if (parts.length === 3) { // H:MM:SS
        seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) { // MM:SS
        seconds = parts[0] * 60 + parts[1];
    } else if (parts.length === 1) { // SS
        seconds = parts[0];
    } else {
        throw new Error(`無效的時間格式 (H:MM:SS): "${hmsString}"`);
    }
    return seconds;
}

window.onYouTubeIframeAPIReady = onYouTubeIframeAPIReady;

// 確保 DOM 完全載入後才執行 URL 參數處理，避免元素找不到
document.addEventListener('DOMContentLoaded', () => {
    processUrlParametersOnLoad();
    // 其他需要在 DOM 載入後執行的初始化程式碼可以放這裡
    originalPageTitle = document.title; // 確保在 DOMContentLoaded 時取得正確的原始標題
});

// --- 處理瀏覽器上一頁/下一頁 ---
window.addEventListener('popstate', (event) => {
    console.log("popstate event. Current URL:", window.location.href, "State:", event.state);

    // 重新從 (已改變的) URL 讀取參數並填入輸入框
    processUrlParametersOnLoad();

    if (autoLoadFromUrlParams) { // processUrlParametersOnLoad 會設定此標記
        if (typeof YT !== 'undefined' && typeof YT.Player === 'function' && player) { // API 已載入且播放器已初始化
            console.log("Popstate: API ready, player exists. Auto-loading based on new URL.");
            handleLoadContent(); // 觸發內容載入
        } else {
            // 若 API 未載入或播放器未建立，onYouTubeIframeAPIReady 會處理 autoLoadFromUrlParams
            console.log("Popstate: API not ready or player not init. Auto-load will be handled by onYouTubeIframeAPIReady.");
        }
    } else if (!window.location.search && !event.state) { // URL 無參數且無 state (可能回到最初始狀態)
        console.log("Popstate: No URL params and no state. Clearing inputs and resetting title.");
        youtubeUrlInput.value = '';
        srtUrlInput.value = '';
        if (srtFileInput) srtFileInput.value = null;
        srtLoadMethod = '';
        document.title = originalPageTitle;
        if (player && typeof player.stopVideo === 'function') player.stopVideo();
        subtitles = [];
        updateSubtitleDisplayEmptyState(); // 重設字幕區為預設
    }
});