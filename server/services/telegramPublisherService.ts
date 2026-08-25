import fs from "fs";
import mediaService from "./mediaService";

export interface TelegramPublishTarget {
  id: string;
  channelId: string;
  name: string;
}

export interface TelegramPublishPost {
  url: string;
  photoUrl?: string;
  videoUrl?: string;
}

export interface TelegramPublishTargetResult {
  targetId: string;
  name: string;
  success: boolean;
  error?: string;
  warning?: string;
}

export interface TelegramPublishSummary {
  total: number;
  succeeded: number;
  failed: number;
  warnings: number;
}

export type TelegramPublishOutcome = "success" | "partial" | "failure";

export interface TelegramPublishBatchResult {
  success: boolean;
  outcome: TelegramPublishOutcome;
  summary: TelegramPublishSummary;
  results: TelegramPublishTargetResult[];
}

export interface TelegramPublishInput {
  botToken: string;
  targets: TelegramPublishTarget[];
  post: TelegramPublishPost;
  text: string;
}

// Keep text-only Telegram messages below the documented 4096-character limit.
// Array.from() splits by Unicode code point, so emoji/surrogate pairs are never cut in half.
export function splitTelegramText(text: string, maxLength = 4000): string[] {
  const characters = Array.from(text);
  const chunks: string[] = [];
  let start = 0;

  while (start < characters.length) {
    const remainingLength = characters.length - start;
    if (remainingLength <= maxLength) {
      const finalChunk = characters.slice(start).join("");
      if (finalChunk.trim()) chunks.push(finalChunk);
      break;
    }

    const window = characters.slice(start, start + maxLength);
    const minimumNaturalBreak = Math.floor(maxLength * 0.6);
    let splitAt = -1;

    for (let i = window.length - 1; i >= minimumNaturalBreak; i--) {
      if (window[i] === "\n") {
        splitAt = i + 1;
        break;
      }
    }

    if (splitAt === -1) {
      for (let i = window.length - 1; i >= minimumNaturalBreak; i--) {
        if (/\s/.test(window[i])) {
          splitAt = i + 1;
          break;
        }
      }
    }

    const take = splitAt > 0 ? splitAt : maxLength;
    const chunk = characters.slice(start, start + take).join("");
    if (chunk.trim()) chunks.push(chunk);
    start += take;
  }

  return chunks;
}

// Bound Telegram Bot API requests so one slow destination cannot stall publishing indefinitely.
// Media uploads get a wider window than ordinary text requests; no automatic retries are used
// because an ambiguous Telegram timeout could otherwise create duplicate posts.
async function fetchTelegramWithTimeout(
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> {
  const requestUrl =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
  const timeoutMs = /\/send(?:Photo|Video)$/.test(requestUrl) ? 90_000 : 30_000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } catch (err: any) {
    if (err?.name === "AbortError") {
      throw new Error(`Telegram request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function formatTelegramChannelId(rawChannelId: string): string {
  let formattedChannelId = rawChannelId.trim();
  if (
    !formattedChannelId.startsWith("@") &&
    !formattedChannelId.startsWith("-") &&
    isNaN(Number(formattedChannelId))
  ) {
    formattedChannelId = `@${formattedChannelId}`;
  }
  return formattedChannelId;
}

async function parseTelegramResponse(telegramResponse: Response, context: string) {
  const raw = await telegramResponse.text();
  try {
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {
      ok: false,
      description: `Telegram returned an invalid response while ${context} (HTTP ${telegramResponse.status}).`
    };
  }
}

async function publishTextChunks(
  botToken: string,
  channelId: string,
  chunks: string[],
  context: string
): Promise<{ success: boolean; responseData: any }> {
  let responseData: any = null;

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex++) {
    const response = await fetchTelegramWithTimeout(
      `https://api.telegram.org/bot${botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: channelId,
          text: chunks[chunkIndex],
          disable_web_page_preview: false
        })
      }
    );

    responseData = await parseTelegramResponse(response, context);
    if (!response.ok || !responseData.ok) {
      return { success: false, responseData };
    }
  }

  return { success: chunks.length > 0, responseData };
}

async function publishToTarget(
  botToken: string,
  target: TelegramPublishTarget,
  post: TelegramPublishPost,
  formattedText: string
): Promise<TelegramPublishTargetResult> {
  const rawChannelId = typeof target.channelId === "string" ? target.channelId.trim() : "";

  if (!rawChannelId) {
    return {
      targetId: target.id,
      name: target.name,
      success: false,
      error: "Target channel/group ID is empty."
    };
  }

  const formattedChannelId = formatTelegramChannelId(rawChannelId);

  try {
    let success = false;
    let responseData: any = null;
    let targetWarning: string | undefined;

    // Always use backend-stored media from the authoritative post record.
    // Prefer an actual video over any legacy thumbnail/photo field on video posts.
    const activeVideo = post.videoUrl;
    const activePhoto = post.photoUrl;

    if (activeVideo) {
      const sendVideoUrl = `https://api.telegram.org/bot${botToken}/sendVideo`;
      const captionParts = splitTelegramText(formattedText, 1000);
      const caption = captionParts.shift() || "";
      let downloadedVideo: Awaited<ReturnType<typeof mediaService.downloadVideoWithMetadata>> = null;
      let videoPublished = false;
      let mediaFailure = "";

      try {
        downloadedVideo = await mediaService.downloadVideoWithMetadata(activeVideo);
        if (!downloadedVideo) {
          throw new Error("Video download failed.");
        }

        const form = new FormData();
        form.append("chat_id", formattedChannelId);
        form.append("supports_streaming", "true");
        if (caption) {
          form.append("caption", caption);
        }

        const videoBuffer = fs.readFileSync(downloadedVideo.filepath);
        form.append(
          "video",
          new Blob([videoBuffer], { type: downloadedVideo.contentType }),
          downloadedVideo.filename
        );

        const videoRes = await fetchTelegramWithTimeout(sendVideoUrl, {
          method: "POST",
          body: form
        });

        responseData = await parseTelegramResponse(videoRes, "sending the video");
        if (videoRes.ok && responseData.ok) {
          videoPublished = true;
          success = true;

          // Video captions share Telegram's 1024-character caption limit. Send the
          // rest as ordinary plain-text messages so long posts remain intact.
          for (let chunkIndex = 0; chunkIndex < captionParts.length; chunkIndex++) {
            const continuationRes = await fetchTelegramWithTimeout(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: formattedChannelId,
                  text: captionParts[chunkIndex],
                  disable_web_page_preview: false
                })
              }
            );

            const continuationData = await parseTelegramResponse(
              continuationRes,
              "sending video continuation text"
            );
            if (!continuationRes.ok || !continuationData.ok) {
              success = false;
              const telegramError = continuationData.description || "Unknown Telegram continuation error";
              responseData = {
                ok: false,
                description: `Video published, but continuation chunk ${chunkIndex + 1}/${captionParts.length} failed: ${telegramError}`
              };
              break;
            }
          }
        } else {
          mediaFailure = responseData.description || "Telegram rejected the video upload.";
        }
      } catch (err: any) {
        mediaFailure = err.message || "Telegram video publishing failed.";
      } finally {
        mediaService.deleteTemp(downloadedVideo?.filepath);
      }

      if (!videoPublished && !success) {
        const fallbackText = formattedText.trim()
          ? `${formattedText}\n\nVideo: ${post.url}`
          : `Video: ${post.url}`;
        const fallbackChunks = splitTelegramText(fallbackText);
        let fallbackSucceeded = fallbackChunks.length > 0;

        for (let chunkIndex = 0; chunkIndex < fallbackChunks.length; chunkIndex++) {
          const fallbackRes = await fetchTelegramWithTimeout(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: formattedChannelId,
                text: fallbackChunks[chunkIndex],
                disable_web_page_preview: false
              })
            }
          );

          const fallbackData = await parseTelegramResponse(
            fallbackRes,
            "sending the video text fallback"
          );
          if (!fallbackRes.ok || !fallbackData.ok) {
            fallbackSucceeded = false;
            const telegramError = fallbackData.description || "Unknown Telegram fallback error";
            responseData = {
              ok: false,
              description: `Video publish failed: ${mediaFailure || "unknown media error"}. Text fallback chunk ${chunkIndex + 1}/${fallbackChunks.length} also failed: ${telegramError}`
            };
            break;
          }
        }

        if (fallbackSucceeded) {
          success = true;
          targetWarning = `Video was not attached; text fallback was published instead: ${mediaFailure || "Telegram video upload failed."}`;
          responseData = { ok: true };
        }
      }
    } else if (activePhoto) {
      const sendPhotoUrl = `https://api.telegram.org/bot${botToken}/sendPhoto`;
      const captionParts = splitTelegramText(formattedText, 1000);
      const caption = captionParts.shift() || "";
      let downloadedImage: Awaited<ReturnType<typeof mediaService.downloadImageWithMetadata>> = null;
      let photoPublished = false;
      let mediaFailure = "";

      try {
        downloadedImage = await mediaService.downloadImageWithMetadata(activePhoto);
        if (!downloadedImage) {
          throw new Error("Image download failed.");
        }

        const form = new FormData();
        form.append("chat_id", formattedChannelId);
        if (caption) {
          form.append("caption", caption);
        }

        const imageBuffer = fs.readFileSync(downloadedImage.filepath);
        form.append(
          "photo",
          new Blob([imageBuffer], { type: downloadedImage.contentType }),
          downloadedImage.filename
        );

        const photoRes = await fetchTelegramWithTimeout(sendPhotoUrl, {
          method: "POST",
          body: form
        });

        responseData = await parseTelegramResponse(photoRes, "sending the photo");
        if (photoRes.ok && responseData.ok) {
          photoPublished = true;
          success = true;

          // Telegram photo captions are limited to 1024 characters. Any remaining
          // text is sent as plain continuation messages without parse_mode.
          for (let chunkIndex = 0; chunkIndex < captionParts.length; chunkIndex++) {
            const continuationRes = await fetchTelegramWithTimeout(
              `https://api.telegram.org/bot${botToken}/sendMessage`,
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  chat_id: formattedChannelId,
                  text: captionParts[chunkIndex],
                  disable_web_page_preview: false
                })
              }
            );

            const continuationData = await parseTelegramResponse(
              continuationRes,
              "sending photo continuation text"
            );
            if (!continuationRes.ok || !continuationData.ok) {
              success = false;
              const telegramError = continuationData.description || "Unknown Telegram continuation error";
              responseData = {
                ok: false,
                description: `Photo published, but continuation chunk ${chunkIndex + 1}/${captionParts.length} failed: ${telegramError}`
              };
              break;
            }
          }
        } else {
          mediaFailure = responseData.description || "Telegram rejected the photo upload.";
        }
      } catch (err: any) {
        mediaFailure = err.message || "Telegram photo publishing failed.";
      } finally {
        mediaService.deleteTemp(downloadedImage?.filepath);
      }

      // If the photo itself was never published, preserve the post content by falling
      // back to plain text plus the stored Telegram media URL. Keep the warning in the
      // per-target result so callers can distinguish a true photo publish from fallback.
      if (!photoPublished && !success) {
        const fallbackText = formattedText.trim()
          ? `${formattedText}\n\nPhoto: ${activePhoto}`
          : `Photo: ${activePhoto}`;
        const fallbackChunks = splitTelegramText(fallbackText);
        let fallbackSucceeded = fallbackChunks.length > 0;

        for (let chunkIndex = 0; chunkIndex < fallbackChunks.length; chunkIndex++) {
          const fallbackRes = await fetchTelegramWithTimeout(
            `https://api.telegram.org/bot${botToken}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: formattedChannelId,
                text: fallbackChunks[chunkIndex],
                disable_web_page_preview: false
              })
            }
          );

          const fallbackData = await parseTelegramResponse(
            fallbackRes,
            "sending the photo text fallback"
          );
          if (!fallbackRes.ok || !fallbackData.ok) {
            fallbackSucceeded = false;
            const telegramError = fallbackData.description || "Unknown Telegram fallback error";
            responseData = {
              ok: false,
              description: `Photo publish failed: ${mediaFailure || "unknown media error"}. Text fallback chunk ${chunkIndex + 1}/${fallbackChunks.length} also failed: ${telegramError}`
            };
            break;
          }
        }

        if (fallbackSucceeded) {
          success = true;
          targetWarning = `Photo was not attached; text fallback was published instead: ${mediaFailure || "Telegram photo upload failed."}`;
          responseData = { ok: true };
        }
      }
    } else {
      // Text-only publishing intentionally avoids parse_mode. Curated/user text can
      // contain literal <, >, &, or model-generated markup that is not valid Telegram HTML.
      const textChunks = splitTelegramText(formattedText);
      if (textChunks.length === 0) {
        throw new Error("Cannot publish an empty text post.");
      }

      for (let chunkIndex = 0; chunkIndex < textChunks.length; chunkIndex++) {
        const textRes = await fetchTelegramWithTimeout(
          `https://api.telegram.org/bot${botToken}/sendMessage`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              chat_id: formattedChannelId,
              text: textChunks[chunkIndex],
              disable_web_page_preview: false
            })
          }
        );

        const rawTextResponse = await textRes.text();
        try {
          responseData = rawTextResponse ? JSON.parse(rawTextResponse) : {};
        } catch {
          responseData = {
            ok: false,
            description: `Telegram returned an invalid response while sending text chunk ${chunkIndex + 1}/${textChunks.length}.`
          };
        }

        if (!textRes.ok || !responseData.ok) {
          const telegramError = responseData.description || "Unknown Telegram text publishing error";
          responseData = {
            ...responseData,
            description: `Text chunk ${chunkIndex + 1}/${textChunks.length} failed: ${telegramError}`
          };
          break;
        }

        if (chunkIndex === textChunks.length - 1) {
          success = true;
        }
      }
    }

    if (success) {
      return {
        targetId: target.id,
        name: target.name,
        success: true,
        ...(targetWarning ? { warning: targetWarning } : {})
      };
    }

    return {
      targetId: target.id,
      name: target.name,
      success: false,
      error: responseData ? responseData.description : "Unknown error response from Telegram"
    };
  } catch (err: any) {
    console.error(`Error posting to target ${target.name}:`, err);
    return {
      targetId: target.id,
      name: target.name,
      success: false,
      error: err.message
    };
  }
}

export class TelegramPublisherService {
  async publish(input: TelegramPublishInput): Promise<TelegramPublishBatchResult> {
    const results = await Promise.all(
      input.targets.map(target => publishToTarget(input.botToken, target, input.post, input.text))
    );

    // Promise completion order is nondeterministic; restore configured target order for callers.
    const targetOrder = new Map(input.targets.map((target, index) => [target.id, index]));
    results.sort(
      (a, b) =>
        (targetOrder.get(a.targetId) ?? Number.MAX_SAFE_INTEGER) -
        (targetOrder.get(b.targetId) ?? Number.MAX_SAFE_INTEGER)
    );

    const successCount = results.filter(result => result.success).length;
    const failureCount = results.length - successCount;
    const warningCount = results.filter(result => !!result.warning).length;
    const atLeastOneSuccess = successCount > 0;
    const outcome: TelegramPublishOutcome =
      successCount === results.length
        ? "success"
        : successCount > 0
          ? "partial"
          : "failure";

    return {
      success: atLeastOneSuccess,
      outcome,
      summary: {
        total: results.length,
        succeeded: successCount,
        failed: failureCount,
        warnings: warningCount
      },
      results
    };
  }
}

export default new TelegramPublisherService();
