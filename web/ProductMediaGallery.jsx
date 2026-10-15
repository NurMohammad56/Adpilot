import React, { useEffect, useState } from 'react';
import { uploadMedia, mediaUrl } from './api.js';
import { useLanguage } from './i18n.js';
import './product-media.css';

export function ProductMediaGallery({ value, setValue, api, busy, onUploading }) {
  const bn = useLanguage() === 'bn';
  const l = (en, bangla) => (bn ? bangla : en);
  const [assets, setAssets] = useState([]),
    [error, setError] = useState(''),
    [uploading, setUploading] = useState(false);
  useEffect(() => {
    onUploading(uploading);
  }, [uploading, onUploading]);
  useEffect(() => {
    api('/media')
      .then(setAssets)
      .catch((error) => setError(error.message));
  }, [api, value.mediaAssetId]);
  const photos = value.mediaAssetIds || [],
    videos = value.videoCreatives || [];
  const primaryType = assets.find((asset) => asset.id === value.mediaAssetId)?.type;
  const photoCount = new Set(
    [primaryType !== 'video' ? value.mediaAssetId : null, ...photos].filter(Boolean),
  ).size;
  const videoCount = new Set(
    [
      primaryType === 'video' ? value.mediaAssetId : null,
      ...videos.map((item) => item.mediaAssetId),
    ].filter(Boolean),
  ).size;
  const changeVideo = (id, thumbnailAssetId) =>
    setValue((current) => ({
      ...current,
      videoCreatives: (current.videoCreatives || []).map((item) =>
        item.mediaAssetId === id ? { ...item, thumbnailAssetId } : item,
      ),
    }));
  return (
    <section className="product-media-gallery" aria-label="Product photos and videos">
      <h4>{l('Product photos and videos', 'প্রোডাক্টের ছবি ও ভিডিও')}</h4>
      <p>
        {l(
          'Save different angles and demonstration videos on this product. Single-product plans create creative variations from these files. Carousel cards use one photo you choose. Uploading does not run an ad.',
          'একই product-এর বিভিন্ন ছবি ও demo video রাখুন। Single-product plan-এ এগুলো থেকে আলাদা creative তৈরি হবে। Carousel-এর জন্য একটি ছবি বেছে নেবেন। Upload করলে ad চালু হয় না।',
        )}
      </p>
      <p className="muted">
        {l(
          'Up to six photos and four videos in total. Images: 10 MB each; videos: 50 MB each. Every video needs an uploaded cover image. AI visual research reads photos, not video footage.',
          'সর্বোচ্চ ৬টি ছবি ও ৪টি video। প্রতি ছবি ১০ MB, video ৫০ MB। প্রতিটি video-এর cover image দিন। AI visual research ছবি বিশ্লেষণ করে; video footage নয়।',
        )}
      </p>
      <label className="field">
        <span>{l('Upload product photos or videos', 'প্রোডাক্টের ছবি বা ভিডিও upload করুন')}</span>
        <input
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,video/mp4,video/webm"
          disabled={busy || uploading}
          onChange={async (event) => {
            const files = Array.from(event.target.files || []);
            event.target.value = '';
            if (!files.length) return;
            setError('');
            setUploading(true);
            try {
              if (
                photoCount + files.filter((file) => file.type.startsWith('image/')).length > 6 ||
                videoCount + files.filter((file) => file.type.startsWith('video/')).length > 4
              )
                throw new Error(
                  l(
                    'Choose fewer files: six photos and four videos per product.',
                    'একসঙ্গে কম ফাইল বাছুন: সর্বোচ্চ ৬টি ছবি ও ৪টি video।',
                  ),
                );
              for (const file of files) {
                const uploaded = await uploadMedia(file);
                setAssets((current) => [
                  uploaded,
                  ...current.filter((item) => item.id !== uploaded.id),
                ]);
                setValue((current) =>
                  uploaded.type === 'video'
                    ? {
                        ...current,
                        videoCreatives: [
                          ...(current.videoCreatives || []),
                          { mediaAssetId: uploaded.id, thumbnailAssetId: null },
                        ],
                      }
                    : {
                        ...current,
                        mediaAssetIds: [
                          ...new Set([...(current.mediaAssetIds || []), uploaded.id]),
                        ],
                      },
                );
              }
              setAssets(await api('/media'));
            } catch (error) {
              setError(error.message);
            } finally {
              setUploading(false);
            }
          }}
        />
      </label>
      {uploading && (
        <p role="status">
          {l('Uploading files… Please keep this form open.', 'ফাইল upload হচ্ছে… form খোলা রাখুন।')}
        </p>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <div className="product-media-grid">
        {photos.map((id) => {
          const asset = assets.find((item) => item.id === id);
          return (
            <article key={id}>
              <img src={mediaUrl(id)} alt={asset?.name || 'Product photo'} loading="lazy" />
              <span>{asset?.name || l('Product photo', 'প্রোডাক্টের ছবি')}</span>
              <button
                type="button"
                className="button secondary"
                disabled={busy || uploading}
                onClick={() =>
                  setValue((current) => ({
                    ...current,
                    mediaAssetIds: (current.mediaAssetIds || []).filter((item) => item !== id),
                  }))
                }
              >
                {l('Remove photo from product', 'প্রোডাক্ট থেকে ছবি সরান')}
              </button>
            </article>
          );
        })}
        {videos.map((item) => {
          const asset = assets.find((asset) => asset.id === item.mediaAssetId);
          return (
            <article key={item.mediaAssetId}>
              <video
                src={mediaUrl(item.mediaAssetId)}
                controls
                preload="metadata"
                poster={item.thumbnailAssetId ? mediaUrl(item.thumbnailAssetId) : undefined}
              />
              <span>{asset?.name || l('Product video', 'প্রোডাক্টের ভিডিও')}</span>
              <label className="field">
                <span>
                  {l('Cover image for', 'Cover image দিন:')} {asset?.name || 'video'}
                </span>
                <select
                  aria-label={`${l('Cover image for', 'Cover image দিন:')} ${asset?.name || 'video'}`}
                  required
                  value={item.thumbnailAssetId || ''}
                  onChange={(event) => changeVideo(item.mediaAssetId, event.target.value || null)}
                >
                  <option value="">
                    {l('Select an uploaded cover image', 'Upload করা cover image বাছুন')}
                  </option>
                  {assets
                    .filter((asset) => asset.type === 'image')
                    .map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.name}
                      </option>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={busy || uploading}
                onClick={() =>
                  setValue((current) => ({
                    ...current,
                    videoCreatives: (current.videoCreatives || []).filter(
                      (video) => video.mediaAssetId !== item.mediaAssetId,
                    ),
                  }))
                }
              >
                {l('Remove video from product', 'প্রোডাক্ট থেকে ভিডিও সরান')}
              </button>
            </article>
          );
        })}
      </div>
      <details className="guide-step">
        <summary>{l('Use files already in Media library', 'Media library থেকে ফাইল নিন')}</summary>
        <div className="product-media-grid">
          {assets.map((asset) => {
            const image = asset.type === 'image',
              checked = image
                ? photos.includes(asset.id)
                : videos.some((item) => item.mediaAssetId === asset.id);
            return (
              <label key={asset.id} className="product-media-option">
                {image ? (
                  <img src={mediaUrl(asset.id)} alt={asset.name} loading="lazy" />
                ) : (
                  <video src={mediaUrl(asset.id)} preload="none" />
                )}
                <span>
                  <input
                    type="checkbox"
                    checked={checked}
                    disabled={
                      busy ||
                      uploading ||
                      (!checked &&
                        (image
                          ? photoCount >= 6 && asset.id !== value.mediaAssetId
                          : videoCount >= 4 && asset.id !== value.mediaAssetId))
                    }
                    onChange={(event) => {
                      const add = event.target.checked;
                      setValue((current) =>
                        image
                          ? {
                              ...current,
                              mediaAssetIds: add
                                ? [...new Set([...(current.mediaAssetIds || []), asset.id])]
                                : (current.mediaAssetIds || []).filter((id) => id !== asset.id),
                            }
                          : {
                              ...current,
                              videoCreatives: add
                                ? [
                                    ...(current.videoCreatives || []),
                                    { mediaAssetId: asset.id, thumbnailAssetId: null },
                                  ]
                                : (current.videoCreatives || []).filter(
                                    (item) => item.mediaAssetId !== asset.id,
                                  ),
                            },
                      );
                    }}
                  />{' '}
                  {asset.name} · {asset.type}
                </span>
              </label>
            );
          })}
        </div>
      </details>
      <p>
        {l(
          'Removing a file here only unlinks it from this product; it remains in Media library.',
          'এখানে সরালে শুধু product থেকে সংযোগ সরে যাবে; ফাইল Media library-তে থাকবে।',
        )}
      </p>
    </section>
  );
}
