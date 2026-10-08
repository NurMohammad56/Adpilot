import { z } from 'zod';
const amount = z.number().finite().min(0).max(1e8);
const text = z.string().trim().min(1).max(500);
export const creativeInputSchema = z
  .object({
    hook: text,
    primaryText: z.string().min(1).max(2200),
    headline: text,
    cta: z.enum(['SHOP_NOW', 'LEARN_MORE', 'CONTACT_US', 'SIGN_UP']),
    language: z.enum(['Bangla', 'English', 'Banglish']),
    concept: z.string().min(1).max(2000),
    imageUrl: z
      .string()
      .url()
      .refine((url) => url.startsWith('https://'))
      .or(z.literal('')),
    mediaAssetId: z.string().uuid().nullable().optional(),
    thumbnailAssetId: z.string().uuid().nullable().optional(),
    mediaType: z.enum(['image', 'video']).optional(),
    assetChecksum: z.string().length(64).optional(),
    thumbnailChecksum: z.string().length(64).optional(),
  })
  .strict();
export const campaignActionSchema = z.discriminatedUnion('action', [
  ...['pause_campaign', 'resume_campaign'].map((action) =>
    z
      .object({
        action: z.literal(action),
        payload: z.object({}).strict().default({}),
        reason: z.string().min(10).max(2000),
      })
      .strict(),
  ),
  z
    .object({
      action: z.literal('update_budget'),
      payload: z.object({ dailyBudget: amount.positive() }).strict(),
      reason: z.string().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal('update_targeting'),
      payload: z
        .object({
          locations: z.array(text).min(1).max(9),
          ageMin: z.number().int().min(18).max(65),
          ageMax: z.number().int().min(18).max(65),
          experimentLabel: text,
        })
        .strict(),
      reason: z.string().min(10).max(2000),
    })
    .strict(),
  z
    .object({
      action: z.literal('replace_creative'),
      payload: z
        .object({ adId: z.string().uuid(), creative: creativeInputSchema, experimentLabel: text })
        .strict(),
      reason: z.string().min(10).max(2000),
    })
    .strict(),
]);
export const costsSchema = z
  .object({
    product: amount,
    packaging: amount,
    delivery: amount,
    paymentFixed: amount,
    paymentPercent: z.number().min(0).max(20),
    other: amount,
    returnRate: z.number().min(0).max(0.8),
    returnCost: amount,
  })
  .strict();
export const businessSchema = z
  .object({
    name: text,
    location: text,
    dailyBudgetCeiling: amount.positive(),
    totalBudgetCeiling: amount.positive(),
    deliveryRegions: z
      .array(
        z.enum([
          'Dhaka',
          'Chattogram',
          'Sylhet',
          'Rajshahi',
          'Khulna',
          'Barishal',
          'Rangpur',
          'Mymensingh',
          'Nationwide',
        ]),
      )
      .min(1)
      .max(9),
  })
  .strict();
export const productSchema = z
  .object({
    name: text,
    category: text,
    paymentMethod: z.enum(['cod', 'prepaid', 'mixed']).optional(),
    deliveryRegions: businessSchema.shape.deliveryRegions.optional(),
    mediaAssetId: z.string().uuid().nullable().optional(),
    thumbnailAssetId: z.string().uuid().nullable().optional(),
    description: z.string().trim().min(10).max(4000),
    costs: costsSchema,
    inventory: z.number().int().min(0).max(1e8),
    minProfit: amount,
    desiredMargin: z.number().min(0).max(0.8),
    sellingPrice: amount.positive().nullable(),
    landingUrl: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://'), 'HTTPS product page required')
      .or(z.literal('')),
    dailyBudgetCeiling: amount.positive(),
    testBudgetCeiling: amount.positive(),
    imageUrl: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://'), 'HTTPS creative image required')
      .or(z.literal(''))
      .default(''),
  })
  .strict();
export const evidenceSchema = z
  .object({
    subject: text,
    finding: z.string().min(5).max(3000),
    source: z
      .string()
      .url()
      .refine((url) => url.startsWith('https://'), 'An HTTPS source URL is required')
      .or(z.literal('user-input'))
      .or(z.literal('demo-fixture'))
      .or(z.literal('ai-provider')),
    observedAt: z.string().datetime(),
    confidence: z.enum(['High', 'Medium', 'Low']),
    classification: z.enum(['observed', 'inferred', 'ai-generated']),
    quality: z.enum([
      'Verified data',
      'Estimated data',
      'AI-generated assumptions',
      'Historical benchmarks',
      'Insufficient data',
    ]),
    value: z.number().finite().min(0).optional(),
  })
  .strict();
export const planEditSchema = z
  .object({
    name: text.optional(),
    sellingPrice: amount.positive().nullable().optional(),
    dailyBudget: amount.positive().optional(),
    durationDays: z.number().int().min(1).max(30).optional(),
    locations: z.array(text).min(1).max(9).optional(),
    ageMin: z.number().int().min(18).max(65).optional(),
    ageMax: z.number().int().min(18).max(65).optional(),
    ads: z
      .array(
        z
          .object({
            id: text,
            hook: text,
            primaryText: z.string().min(1).max(2200),
            headline: text,
            cta: z.enum(['SHOP_NOW', 'LEARN_MORE', 'CONTACT_US', 'SIGN_UP']),
            language: z.enum(['Bangla', 'English', 'Banglish']),
            concept: z.string().min(1).max(2000),
            imageUrl: z
              .string()
              .url()
              .refine((url) => url.startsWith('https://'))
              .or(z.literal('')),
            mediaAssetId: z.string().uuid().nullable().optional(),
            thumbnailAssetId: z.string().uuid().nullable().optional(),
            mediaType: z.enum(['image', 'video']).optional(),
            assetChecksum: z.string().length(64).optional(),
            thumbnailChecksum: z.string().length(64).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(6)
      .optional(),
  })
  .strict();
