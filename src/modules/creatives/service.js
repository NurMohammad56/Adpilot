import { id } from '../../utils/core.js';
import { copyOutputSchema } from '../../ai/provider.js';
export async function generateCopy(product, economics, research, llm) {
  const generated = await llm.generate(
    'campaign-copy',
    {
      product,
      sellingPrice: economics.sellingPrice,
      findings: research.findings,
      schema: 'ads[{hook,primaryText,headline,language,concept}]',
      rules:
        'Use only supported claims. Do not promise results, invent discounts, or claim COD/free shipping unless confirmed.',
    },
    copyOutputSchema,
  );
  const templates = [
    {
      hook: 'আপনার প্রতিদিনের জন্য',
      primaryText: `${product.name} সম্পর্কে জানুন। মূল্য ৳${economics.sellingPrice}। পণ্যের বিস্তারিত, ডেলিভারি এবং পেমেন্টের শর্ত দেখে অর্ডার করুন।`,
      headline: `${product.name} — বিস্তারিত দেখুন`,
      language: 'Bangla',
      concept:
        'Product-led still image showing the actual product, with clear price and verified specifications.',
    },
    {
      hook: 'See it in everyday use',
      primaryText: `Explore ${product.name} at ৳${economics.sellingPrice}. See the product details and check delivery availability before ordering.`,
      headline: 'Find your everyday fit',
      language: 'English',
      concept:
        'A short demonstration of the actual product. Validate the problem/solution angle through customer feedback.',
    },
    {
      hook: 'অর্ডারের আগে জেনে নিন',
      primaryText: `${product.name}, ৳${economics.sellingPrice}। কেনার আগে পণ্যের তথ্য ও ডেলিভারি শর্ত জানুন।`,
      headline: 'পণ্য দেখুন, সিদ্ধান্ত নিন',
      language: 'Bangla',
      concept:
        'Trust-led carousel covering actual materials, use case, and published delivery policy. No unsupported guarantees.',
    },
  ];
  return (generated?.ads || templates).map((ad) => ({
    ...ad,
    id: id(),
    cta: 'SHOP_NOW',
    imageUrl: product.imageUrl || '',
    ...(product.mediaAssetId ? { mediaAssetId: product.mediaAssetId, thumbnailAssetId: product.thumbnailAssetId || null } : {}),
    hypothesis: true,
  }));
}
