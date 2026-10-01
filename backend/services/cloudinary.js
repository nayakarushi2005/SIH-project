const crypto = require('crypto');

/**
 * Job photos go straight from the app to Cloudinary. The backend only signs
 * the upload, which pins it to the user's own folder, and later checks that
 * a posted photo URL really came from that folder.
 */

function jobPhotoFolder(userId) {
  return `sih/jobs/${userId}`;
}

function federationWorkerPhotoFolder(federationId) {
  return `sih/federations/${federationId}/workers`;
}

/**
 * Credentials from CLOUDINARY_CLOUD_NAME / _API_KEY / _API_SECRET, or from the
 * single CLOUDINARY_URL (cloudinary://<key>:<secret>@<cloud>) the dashboard shows.
 */
function getConfig() {
  const { CLOUDINARY_URL, CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } =
    process.env;

  if (CLOUDINARY_URL) {
    try {
      const url = new URL(CLOUDINARY_URL);
      return {
        cloudName: url.hostname,
        apiKey: decodeURIComponent(url.username),
        apiSecret: decodeURIComponent(url.password),
      };
    } catch {
      return {};
    }
  }

  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    apiSecret: CLOUDINARY_API_SECRET,
  };
}

/**
 * Signs upload `params` for Cloudinary: the params sorted by name and joined
 * as k=v&k=v, followed by the API secret. Returns the params plus what the
 * upload request needs alongside them.
 */
function signUpload(params) {
  const { cloudName, apiKey, apiSecret } = getConfig();
  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error('Photo uploads are not configured on the server.');
  }

  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join('&');
  const signature = crypto.createHash('sha1').update(toSign + apiSecret).digest('hex');

  return {
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    apiKey,
    ...params,
    signature,
  };
}

/**
 * Signed params for a direct upload. The app POSTs the image to `uploadUrl`
 * as multipart form data with file, api_key, timestamp, folder and signature.
 * Signatures stay valid for an hour.
 */
function signJobPhotoUpload(userId) {
  return signUpload({
    folder: jobPhotoFolder(userId),
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function signFederationWorkerPhotoUpload(federationId) {
  return signUpload({
    folder: federationWorkerPhotoFolder(federationId),
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function isUploadedToFolder(url, folder) {
  if (typeof url !== 'string') return false;

  const { cloudName } = getConfig();
  if (!cloudName) return false;

  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;
  if (!url.startsWith(prefix)) return false;

  const pathWithoutVersion = url.slice(prefix.length).replace(/^v\d+\//, '');
  return (
    pathWithoutVersion.startsWith(`${folder}/`) &&
    !pathWithoutVersion.includes('..') &&
    !/[?#\s]/.test(pathWithoutVersion)
  );
}

/** True if `url` is an image this user uploaded through signJobPhotoUpload. */
function isOwnedJobPhoto(url, userId) {
  return isUploadedToFolder(url, jobPhotoFolder(userId));
}

function isOwnedFederationWorkerPhoto(url, federationId) {
  return isUploadedToFolder(url, federationWorkerPhotoFolder(federationId));
}

module.exports = {
  jobPhotoFolder,
  federationWorkerPhotoFolder,
  signJobPhotoUpload,
  signFederationWorkerPhotoUpload,
  signUpload,
  isOwnedJobPhoto,
  isOwnedFederationWorkerPhoto,
};
