/**
 * photo.js
 * Photo upload handling and quest verification for Subway Quest.
 *
 * Responsibilities:
 * - Accept file uploads (or camera captures) from the user
 * - Display an image preview
 * - Verify the photo using a local CLIP model (Transformers.js)
 * - Return verification results including confidence score
 *
 * Two-pass verification strategy
 * ───────────────────────────────
 * Pass 1 — Subject check:
 *   CLIP scores the image against the target `clipLabel` (a short visual
 *   noun-phrase like "a subway station name sign") vs. a bank of decoys
 *   that represent common cheats (screenshots, stock photos, wrong subjects).
 *   The target must score ABOVE the threshold AND beat every decoy.
 *
 * Pass 2 — Authenticity check:
 *   A second CLIP classification distinguishes "a real photograph taken in
 *   the real world" from "a screenshot of a website or map" and
 *   "a stock photo or online image".  This blocks Google Maps screenshots,
 *   image searches, and street-view grabs.
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
 * @param {File|Blob} imageBlob     - The image file/blob (most reliable input for RawImage)
 * @param {string}    stationName   - Name of the station (used for UI messaging)
 * @param {string}    clipLabel     - SHORT visual noun-phrase for CLIP, e.g. "a subway station name sign"
 *                                    (NOT the long quest instruction string)
 * @param {function}  [onProgress]  - Optional progress callback (msg: string) => void
 * @returns {Promise<VerifyResult>}
 */
<<<<<<< HEAD
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
=======
export async function verifyPhoto(imageBlob, stationName, clipLabel, onProgress) {
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

    // ─── Pass 1: Subject match ────────────────────────────────────────────────
    //
    // The target clipLabel competes against specific, realistic decoys.
    // Generic decoys like "a blurry photo" are too easy for CLIP to dismiss —
    // we use concrete alternatives that represent real cheating scenarios.

    const SUBJECT_THRESHOLD = 0.35; // target must score above this
    const SUBJECT_MARGIN = 0.05; // target must also beat the top decoy by this margin

    const subjectDecoys = [
      // Screen captures / digital sources
      'a screenshot of Google Maps or Google Street View',
      'a screenshot of a website or web page',
      'a photo of a computer or phone screen',
      // Stock / online image tells
      'a professional stock photography image with perfect lighting',
      'a digitally edited or watermarked image',
      // Wrong-subject catches (generic scenes)
      'an indoor room or building interior',
      'a selfie portrait of a person indoors',
      'a nature scene with trees and grass',
      'a blank or mostly empty image',
      'food on a plate or dining table',
    ];

    const subjectLabels = [clipLabel, ...subjectDecoys];
    notify('Checking subject match…');
    const subjectResults = await clipClassifier(imageBlob, subjectLabels);

    // subjectResults is sorted by score descending
    const targetResult = subjectResults.find(r => r.label === clipLabel);
    const topDecoyScore = subjectResults.filter(r => r.label !== clipLabel)
      .reduce((max, r) => Math.max(max, r.score), 0);

    const subjectPassed =
      targetResult.score >= SUBJECT_THRESHOLD &&
      targetResult.score - topDecoyScore >= SUBJECT_MARGIN;

    if (!subjectPassed) {
      const topDecoy = subjectResults.find(r => r.label !== clipLabel && r.score === topDecoyScore);
      const hint = targetResult.score < SUBJECT_THRESHOLD
        ? `AI confidence too low (${Math.round(targetResult.score * 100)}%). Make sure the subject is visible and well-lit.`
        : `This looks more like "${topDecoy?.label ?? 'something else'}" than the quest target. Try taking a real photo.`;

      return {
        success: false,
        message: hint,
        confidence: targetResult.score,
        tags: subjectResults.map(r => r.label),
      };
    }

    // ─── Pass 2: Authenticity check ───────────────────────────────────────────
    //
    // We check if the image looks like a real-world photo vs a screenshot or
    // stock image.  This specifically blocks Google Maps, Street View grabs,
    // and reverse-image-search results.

    const AUTHENTICITY_THRESHOLD = 0.45;

    const authenticityLabels = [
      'a real photograph taken outdoors in the real world',          // ← want this
      'a screenshot of Google Street View or Maps',
      'a stock photo downloaded from the internet',
      'a photo of a computer monitor or phone screen showing an image',
      'an AI-generated or edited image',
    ];

    notify('Checking photo authenticity…');
    const authResults = await clipClassifier(imageBlob, authenticityLabels);
    const realPhotoScore = authResults.find(r => r.label === authenticityLabels[0])?.score ?? 0;
    const authenticityPassed = realPhotoScore >= AUTHENTICITY_THRESHOLD;

    if (!authenticityPassed) {
      const topFake = authResults
        .filter(r => r.label !== authenticityLabels[0])
        .sort((a, b) => b.score - a.score)[0];

      return {
        success: false,
        message: topFake?.score > 0.3
          ? `That looks like it might be "${topFake.label}". Please take a real photo at the location!`
          : `Couldn't verify this is a real photo taken at the location. Please try again with your camera.`,
        confidence: realPhotoScore,
        tags: authResults.map(r => r.label),
      };
    }

    // ─── Both passes passed ───────────────────────────────────────────────────

    return {
      success: true,
      message: `Quest complete! AI verified "${clipLabel}" at ${stationName}.`,
      confidence: targetResult.score,
      tags: subjectResults.map(r => r.label),
    };

  } catch (error) {
    console.error('[photo.js] Local Verification failed:', error);
    throw new Error('Could not run the AI model on your device. It might be out of memory.');
  }
>>>>>>> f865ad73917327da9fd22d8e4110a744a364e0b4
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