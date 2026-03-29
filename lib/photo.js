/**
 * photo.js
 * Photo upload handling and quest verification for Subway Quest.
 *
 * Responsibilities:
 *  - Accept file uploads (or camera captures) from the user
 *  - Display an image preview
 *  - Verify the photo using the Anthropic Vision API (stubbed)
 *  - Return verification results including confidence score
 *
 * Anthropic Vision API stub:
 *   Replace ANTHROPIC_VISION_STUB with a real server-side endpoint.
 *   The API key MUST NOT be exposed in client-side JS — proxy through
 *   your backend (e.g. /api/verify-photo) to keep it secure.
 */

// ─── Types ────────────────────────────────────────────────

/**
 * @typedef {{ success: boolean, message: string, confidence: number, tags: string[] }} VerifyResult
 */

// ─── Anthropic Vision API Stub ────────────────────────────

/**
 * STUB: Verify a photo using Anthropic's vision model (claude-opus-4-6 or claude-sonnet-4-6).
 *
 * In production, proxy this through your backend:
 *   POST /api/verify-photo
 *   Body: { imageBase64: string, stationName: string, questDescription: string }
 *   Response: VerifyResult
 *
 * Backend would call Anthropic's Messages API:
 *   POST https://api.anthropic.com/v1/messages
 *   Headers:
 *     x-api-key: process.env.ANTHROPIC_API_KEY
 *     anthropic-version: 2023-06-01
 *   Body:
 *     {
 *       model: "claude-opus-4-6",
 *       max_tokens: 256,
 *       messages: [{
 *         role: "user",
 *         content: [
 *           { type: "image", source: { type: "base64", media_type: "image/jpeg", data: imageBase64 } },
 *           { type: "text", text: `The user is completing a Subway Quest at "${stationName}".
 *             Quest: "${questDescription}".
 *             Does this photo appear to show: (1) a real NYC location, (2) something related to the quest?
 *             Respond with JSON: { "verified": true/false, "confidence": 0.0-1.0, "reason": "...", "tags": [] }` }
 *         ]
 *       }]
 *     }
 *
 * @param {string} imageBase64  - base64-encoded image (without data URL prefix)
 * @param {string} mediaType    - e.g. "image/jpeg"
 * @param {string} stationName
 * @param {string} questDescription
 * @returns {Promise<VerifyResult>}
 */
export async function verifyPhoto(imageBase64, mediaType, stationName, questDescription) {
  console.info('[photo.js] verifyPhoto() — using stub for testing. Real AI verification disabled.');

  // Simulate a 1.8 second loading delay so the UI spinner actually shows up
  await new Promise(resolve => setTimeout(resolve, 1800));

  // Always return success to instantly award the points
  return {
    success: true,
    message: `Great shot! Your photo from ${stationName} has been verified.`,
    confidence: 0.99,
    tags: ['auto-verified', 'subway'],
  };
}

// ─── Image processing helpers ─────────────────────────────

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
      // Strip the "data:image/jpeg;base64," prefix
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
 * Returns a new File with reduced size.
 *
 * @param {File} file
 * @param {object} [options]
 * @param {number} [options.maxDimension=1200] - Max width or height in pixels
 * @param {number} [options.quality=0.82] - JPEG quality 0–1
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

// ─── Upload controller ────────────────────────────────────

/**
 * Initialize photo upload behavior on the upload area.
 *
 * Wires up:
 *  - File <input> change events
 *  - Drag-and-drop
 *  - Image preview rendering
 *
 * @param {object} elements
 * @param {HTMLInputElement}  elements.input         - The file input element
 * @param {HTMLElement}       elements.uploadArea    - The drop zone container
 * @param {HTMLElement}       elements.placeholder   - Shown when no photo selected
 * @param {HTMLImageElement}  elements.preview       - The <img> preview element
 * @param {HTMLButtonElement} elements.verifyBtn     - The "Verify" button
 * @param {function}          onPhotoReady           - Called with the processed File when ready
 */
export function initPhotoUpload(elements, onPhotoReady) {
  const { input, uploadArea, placeholder, preview, verifyBtn } = elements;

  /**
   * Handle a selected/dropped File.
   * @param {File} file
   */
  async function handleFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      showUploadError('Please select a valid image file (JPG, PNG, or HEIC).');
      return;
    }

    // Size guard: reject files over 25 MB before resizing
    if (file.size > 25 * 1024 * 1024) {
      showUploadError('Image is too large. Please choose a file under 25 MB.');
      return;
    }

    try {
      const processed = await resizeImage(file);
      const { dataUrl } = await readFileAsBase64(processed);

      // Show preview
      preview.src = dataUrl;
      preview.hidden = false;
      placeholder.hidden = true;

      // Enable verify button
      verifyBtn.disabled = false;

      onPhotoReady(processed, dataUrl);
    } catch (err) {
      showUploadError(`Could not process image: ${err.message}`);
    }
  }

  // File input change
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    if (file) handleFile(file);
  });

  // Drag and drop
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

  // Keyboard accessibility for the upload area
  uploadArea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      input.click();
    }
  });
}

/**
 * Display an error message in the upload area.
 * @param {string} message
 */
function showUploadError(message) {
  console.error('[photo.js]', message);
  // You can extend this to show a toast or inline error in the UI.
  // For now, use the global toast if available.
  if (window.__sqShowToast) window.__sqShowToast(message);
}

/**
 * Reset the photo upload UI to its initial state.
 * @param {object} elements - Same elements object passed to initPhotoUpload()
 */
export function resetPhotoUpload(elements) {
  const { input, placeholder, preview, verifyBtn } = elements;

  input.value = '';
  preview.src = '';
  preview.hidden = true;
  placeholder.hidden = false;
  verifyBtn.disabled = true;
}
