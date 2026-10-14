import React, { useEffect, useState } from 'react';
import { CampaignField } from './FieldHelp.jsx';
import { uploadMedia } from './api.js';
import './workspace-tools.css';
export function MediaPicker({ api, value, thumbnail, onChange }) {
  const [assets, setAssets] = useState([]);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  useEffect(() => {
    api('/media')
      .then(setAssets)
      .catch((error) => setError(error.message));
  }, []);
  const selected = assets.find((asset) => asset.id === value);
  return (
    <div className="media-picker">
      <CampaignField
        label="Upload a creative here"
        help="Upload a real image or video showing your service or product. Images can be JPEG, PNG or WebP, up to 10 MB. Videos can be MP4 or WebM, up to 50 MB."
        hint="Upload directly without leaving this form. Images: 10 MB. Videos: 50 MB."
      >
        <input
          aria-label="Upload a creative here"
          type="file"
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          disabled={uploading}
          onChange={async (event) => {
            const file = event.target.files[0];
            if (!file) return;
            setUploading(true);
            setError('');
            try {
              const uploaded = await uploadMedia(file);
              setAssets(await api('/media'));
              onChange(uploaded.id, null);
            } catch (error) {
              setError(error.message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </CampaignField>
      {uploading && <p role="status">Uploading your private creative…</p>}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <CampaignField
        label="Uploaded image or video"
        help="Choose a file from this workspace media library. It will be used in your ad. Uploading a file does not publish an ad."
      >
        <select
          value={value || ''}
          onChange={(event) => onChange(event.target.value || null, null)}
        >
          <option value="">Choose an uploaded image or video</option>
          {assets.map((asset) => (
            <option key={asset.id} value={asset.id}>
              {asset.name} · {asset.type}
            </option>
          ))}
        </select>
      </CampaignField>
      {selected && (
        <div className="media-preview">
          {selected.type === 'video' ? (
            <video src={selected.contentUrl} controls preload="metadata" />
          ) : (
            <img src={selected.contentUrl} alt={selected.name} />
          )}
        </div>
      )}
      {selected?.type === 'video' && (
        <CampaignField
          label="Video cover image"
          help="Choose a still image to show before your video plays. An uploaded video needs a cover image before the campaign can be approved."
        >
          <select
            value={thumbnail || ''}
            required
            onChange={(event) => onChange(value, event.target.value || null)}
          >
            <option value="">Select an uploaded cover image</option>
            {assets
              .filter((asset) => asset.type === 'image')
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
          </select>
        </CampaignField>
      )}
    </div>
  );
}
