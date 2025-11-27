import JSZip from 'jszip';
import { Tag } from './types';

export const formatTime = (seconds: number, includeMs: boolean = false): string => {
  if (isNaN(seconds)) return includeMs ? "00:00.000" : "00:00";
  
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  const mStr = m.toString().padStart(2, '0');
  const sStr = s.toString().padStart(2, '0');

  let timeStr = `${mStr}:${sStr}`;

  if (h > 0) {
    const hStr = h.toString().padStart(2, '0');
    timeStr = `${hStr}:${mStr}:${sStr}`;
  }
  
  if (includeMs) {
    const ms = Math.floor((seconds % 1) * 1000);
    const msStr = ms.toString().padStart(3, '0');
    return `${timeStr}.${msStr}`;
  }
  
  return timeStr;
};

export const generateId = (): string => {
  return Math.random().toString(36).substring(2, 9);
};

export const extractWebVideoUrl = async (input: string): Promise<{ url: string; duration?: number }> => {
  const proxyBase = 'https://corsproxy.io/?';

  // 1. Extract URL from text
  const urlMatch = input.match(/https?:\/\/[a-zA-Z0-9\-\._~:/?#[\]@!$&'()*+,;=%]+/);
  if (!urlMatch) {
    throw new Error("No URL found in the provided text");
  }
  
  // Clean trailing punctuation
  let targetUrl = urlMatch[0];
  targetUrl = targetUrl.replace(/[.,;:!)]+$/, "");

  // --- Bilibili Logic (External API Strategy) ---
  if (targetUrl.includes('bilibili.com') || targetUrl.includes('b23.tv')) {
    try {
      console.log(`Bilibili: Parsing via mir6 API...`);
      
      // Use the specified external API for parsing
      const apiUrl = `https://api.mir6.com/api/bzjiexi?url=${encodeURIComponent(targetUrl)}&type=json`;
      
      // Use proxy for the API call itself to avoid CORS issues on the JSON request
      const response = await fetch(`${proxyBase}${encodeURIComponent(apiUrl)}`);
      const json = await response.json();

      if (json.code === 200 && json.data && json.data.length > 0) {
        const videoData = json.data[0];
        let videoUrl = videoData.video_url;
        const duration = videoData.duration; // Extract duration if available (in seconds)
        
        if (!videoUrl) throw new Error("API returned success but no video URL found.");

        // Ensure HTTPS
        if (videoUrl.startsWith('http:')) {
          videoUrl = videoUrl.replace('http:', 'https:');
        }

        // Return direct URL (no proxy wrapper) for best playback performance.
        return { 
          url: videoUrl,
          duration: typeof duration === 'number' ? duration : undefined
        };
      } else {
        throw new Error(json.msg || "Bilibili API parsing failed");
      }
    } catch (e: any) {
      console.error("Bilibili Parse Error:", e);
      throw new Error(`Failed to parse Bilibili video: ${e.message}`);
    }
  }

  // --- Fallback / General Logic (Scrape HTML for XHS etc) ---
  const proxyUrl = `${proxyBase}${encodeURIComponent(targetUrl)}`;

  try {
    const response = await fetch(proxyUrl);
    
    if (!response.ok) {
       throw new Error(`Failed to fetch page content: ${response.status}`);
    }
    
    const html = await response.text();

    // --- Xiaohongshu Logic ---
    const metaMatch = html.match(/<meta (?:name|property)="og:video" content="([^"]+)"/i);
    if (metaMatch && metaMatch[1]) {
      return { url: metaMatch[1] };
    }

    const jsonMatch = html.match(/"masterUrl":"([^"]+)"/);
    if (jsonMatch && jsonMatch[1]) {
      const cleanedUrl = jsonMatch[1].replace(/\\u002F/g, "/").replace(/\\/g, "");
      return { url: cleanedUrl };
    }

    throw new Error("Could not find video stream. Please check if the link is valid.");
  } catch (error: any) {
    console.error("Web Parse Error:", error);
    throw new Error(error.message || "Failed to parse video link");
  }
};

/**
 * Helper to capture frames and return them as an array of data objects.
 * Used for both Zip export and AI generation.
 */
export const captureFramesAsBase64 = async (
  videoSrc: string,
  tags: Tag[],
  onProgress?: (count: number, total: number) => void
): Promise<{ tagId: string; timestamp: number; data: string }[]> => {
  if (!tags.length) return [];

  const video = document.createElement('video');
  
  // IMPORTANT: For Bilibili direct links, we MUST use a proxy to get CORS headers
  // otherwise canvas.toDataURL will fail (tainted canvas).
  const isBilibiliDirect = videoSrc.includes('.bilivideo.com') || videoSrc.includes('hdslb.com');
  
  if (isBilibiliDirect && !videoSrc.includes('corsproxy.io')) {
    // Wrap in proxy strictly for the purpose of capturing frames
    video.src = `https://corsproxy.io/?${encodeURIComponent(videoSrc)}`;
  } else {
    video.src = videoSrc;
  }

  video.crossOrigin = "anonymous"; // Essential for canvas export
  video.muted = true;
  video.playsInline = true;

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = resolve;
    video.onerror = () => reject(new Error("Failed to load video for capture (CORS or Network error)"));
    video.load();
  });

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error("Could not create canvas context");

  // Sort tags by time to optimize seeking
  const sortedTags = [...tags].sort((a, b) => a.timestamp - b.timestamp);
  const results: { tagId: string; timestamp: number; data: string }[] = [];

  for (let i = 0; i < sortedTags.length; i++) {
    const tag = sortedTags[i];
    if (onProgress) onProgress(i + 1, sortedTags.length);

    video.currentTime = tag.timestamp;

    await new Promise<void>((resolve) => {
      const onSeeked = () => {
        video.removeEventListener('seeked', onSeeked);
        resolve();
      };
      setTimeout(resolve, 8000); // Generous timeout for proxy loading
      video.addEventListener('seeked', onSeeked, { once: true });
    });

    try {
      ctx.drawImage(video, 0, 0);
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      results.push({ tagId: tag.id, timestamp: tag.timestamp, data: base64 });
    } catch (e) {
      console.warn(`Frame capture failed at ${tag.timestamp}s`, e);
      // Skip failed frames but continue
    }
  }

  return results;
};

export const exportVideoFrames = async (
  videoSrc: string, 
  tags: Tag[], 
  onProgress: (count: number, total: number) => void
): Promise<Blob | null> => {
  const frames = await captureFramesAsBase64(videoSrc, tags, onProgress);
  if (!frames.length) return null;

  const zip = new JSZip();
  
  frames.forEach(frame => {
    // Remove data URL prefix for zip
    const base64Data = frame.data.split(',')[1];
    const timeStr = formatTime(frame.timestamp, true).replace(/:/g, '-').replace('.', '_');
    zip.file(`frame_${timeStr}.jpg`, base64Data, { base64: true });
  });

  return await zip.generateAsync({ type: "blob" });
};