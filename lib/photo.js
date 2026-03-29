/**
 * photo.js
 * Photo upload handling and quest verification for Subway Quest.
 *
 * Responsibilities:
 * - Accept file uploads (or camera captures) from the user
 * - Display an image preview
 * - Verify the photo using the Hugging Face Inference API (CLIP model)
 * - Return verification results including confidence score
 */

// Types

/**
 * @typedef {{ success: boolean, message: string, confidence: number, tags: string[] }} VerifyResult
 */

// Hugging Face Vision API
import { pipeline, env } from '@huggingface/transformers';
// Optional: Ensure it pulls from the Hugging Face Hub
env.allowLocalModels = false;
// Store the pipeline globally so the 90MB model only downloads ONCE per session
let clipClassifier = null;
/**
 * Verify a photo using Hugging Face Client-Side AI (@huggingface/transformers v3)
 *
 * @param {string} imageBase64  - base64-encoded image (without data URL prefix)
 * @param {string} mediaType    - e.g. "image/jpeg"
 * @param {string} stationName  - Name of the station (used for UI messaging)
 * @param {string} questDescription - The target text to match (e.g., "a yellow mosaic tile")
 * @returns {Promise<VerifyResult>}
 */

/**
 * @param {function} [onProgress]  - Optional progress callback (msg: string) => void
 */
export async function verifyPhoto(dataUrl, mediaType, stationName, questDescription, onProgress) {
  console.info('[photo.js] verifyPhoto() — Running local Transformers.js...');

  const notify = (msg) => {
    console.log('[photo.js]', msg);
    if (onProgress) onProgress(msg);
  };

  try {
    // 1. Load the model (downloads ~90 MB on first run)
    if (!clipClassifier) {
      notify('Downloading AI model for the first time (~90 MB)…');

      clipClassifier = await pipeline(
        'zero-shot-image-classification',
        'Xenova/clip-vit-base-patch32',
        {
          progress_callback: (p) => {
            if (p.status === 'downloading' && p.total) {
              const pct = Math.round((p.loaded / p.total) * 100);
              notify(`Downloading AI model… ${pct}%`);
            } else if (p.status === 'loading') {
              notify('Loading AI model into memory…');
            }
          },
        }
      );

      notify('AI model ready! Analyzing your photo…');
    }

    // 2. Set up the target and the decoys
    const candidateLabels = [
      questDescription,
      "a generic blurry photo",
      "empty subway station",
      "a blank wall",
      "people walking"
    ];

    // 3. Run the inference
    // v3 handles the base64 dataUrl string directly!
    const results = await clipClassifier(dataUrl, candidateLabels);

    // results looks like: [{ label: "yellow tile", score: 0.88 }, ...]
    const bestMatch = results[0];
    const threshold = 0.40; // Tweak this based on how strict you want the game to be

    const isSuccess = bestMatch.label === questDescription && bestMatch.score > threshold;

    let finalMessage = isSuccess
      ? `Quest complete! On-device AI verified "${questDescription}" at ${stationName}.`
      : `Hmm, that doesn't quite look right. The AI thought this looked more like "${bestMatch.label}".`;

    return {
      success: isSuccess,
      message: finalMessage,
      confidence: bestMatch.score,
      tags: results.map(r => r.label)
    };

  } catch (error) {
    console.error('[photo.js] Local Verification failed:', error);
    throw new Error('Could not run the AI model on your device. It might be out of memory.');
  }
}

// Image processing helpers

/**
 * Read a File object as a base64-encoded string (without the data URL prefix).
 * @param {File} file
 * @returns {Promise<{ base64: string, mediaType: string, dataUrl: string }>}
 */
export function readFileAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      const [header, base64] = dataUrl.split(',');
      const mediaType = header.replace('data:', '').replace(';base64', '');
      resolve({ base64, mediaType, dataUrl });
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

/**
 * Compress and resize an image file before upload/verification.
 * @param {File} file
 * @param {object} [options]
 * @returns {Promise<File>}
 */
export function resizeImage(file, { maxDimension = 1200, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      let { width, height } = img;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height / width) * maxDimension);
          width = maxDimension;
        } else {
          width = Math.round((width / height) * maxDimension);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        blob => {
          if (!blob) { reject(new Error('Canvas toBlob() failed.')); return; }
          resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to load image for resizing.'));
    };

    img.src = objectUrl;
  });
}

// Upload controller

/**
 * Initialize photo upload behavior on the upload area.
 * @param {object} elements
 * @param {function} onPhotoReady
 */
export function initPhotoUpload(elements, onPhotoReady) {
  const { input, uploadArea, placeholder, preview, verifyBtn } = elements;

  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showUploadError('Please select a valid image file (JPG, PNG, or HEIC).');
      return;
    }

    if (file.size > 25 * 1024 * 1024) {
      showUploadError('Image is too large. Please choose a file under 25 MB.');
      return;
    }

    try {
      const processed = await resizeImage(file);
      const { dataUrl, base64, mediaType } = await readFileAsBase64(processed);

      preview.src = dataUrl;
      preview.hidden = false;
      placeholder.hidden = true;
      verifyBtn.disabled = false;

      // Passing base64 and mediaType to the callback so the UI can easily hand it to verifyPhoto()
      onPhotoReady(processed, dataUrl, base64, mediaType);
    } catch (err) {
      showUploadError(`Could not process image: ${err.message}`);
    }
  }

  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });

  uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
  });

  uploadArea.addEventListener('dragleave', () => {
    uploadArea.classList.remove('drag-over');
  });

  uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  });

  uploadArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
}

function showUploadError(message) {
  console.error('[photo.js]', message);
  if (window.__sqShowToast) window.__sqShowToast(message);
}

export function resetPhotoUpload(elements) {
  const { input, placeholder, preview, verifyBtn } = elements;
  input.value = '';
  preview.src = '';
  preview.hidden = true;
  placeholder.hidden = false;
  verifyBtn.disabled = true;
}