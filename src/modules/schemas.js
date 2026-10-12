import { z } from 'zod';
const amount = z.number().finite().min(0).max(1e8);
const text = z.string().trim().min(1).max(500);
export const carouselCardSchema = z
  .object({
    productId: z.string().uuid(),
    name: text,
    headline: text,
    description: z.string().max(1000),
    link: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://')),
    sellingPrice: amount.positive(),
    imageUrl: z
      .string()
      .url()
      .max(1000)
      .refine((url) => url.startsWith('https://'))
      .or(z.literal('')),
    mediaAssetId: z.string().uuid().nullable().optional(),
    mediaType: z.literal('image').optional(),
    assetChecksum: z.string().length(64).optional(),
  })
  .strict();
export const retrievalSchema = z
  .object({
    provider: z.enum(['openai', 'gemini']),
    model: z.string().min(1).max(150),
    thinking: z.enum(['low', 'high']),
    status: z.enum(['completed', 'unavailable', 'disabled']),
    sourceCount: z.number().int().min(0).max(100),
    searchCalls: z.number().int().min(0).max(100),
    checkedAt: z.string().datetime(),
    citedSourceCount: z.number().int().min(0).max(100).optional(),
    independentSourceCount: z.number().int().min(0).max(100).optional(),
    collectionRounds: z.number().int().min(0).max(2).optional(),
    sources: z
      .array(
        z
          .object({
            source: z.string().url().max(2000),
            title: z.string().max(500),
            cited: z.boolean(),
          })
          .strict(),
      )
      .max(50)
      .optional(),
  })
  .strict();
export const competitorCandidateSchema = z
  .object({
    name: z.string().min(1).max(200),
    offer: z.string().min(1).max(1000),
    source: z.string().url().max(2000),
    price: amount.positive().nullable(),
    currency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .nullable(),
    priceBasis: z.string().max(500),
    comparability: z.string().min(1).max(1000),
    deliveryTerms: z.string().max(1000),
  })
  .strict();
export const creativeInputSchema = z
  .object({
    format: z.enum(['single', 'carousel']).optional(),
    cards: z.array(carouselCardSchema).min(2).max(10).optional(),
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
          locationIds: z.array(z.string().uuid()).max(8).optional(),
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
    condition: z.enum(['new', 'used', 'refurbished']).optional(),
    brand: z.string().trim().max(100).optional(),
    gtin: z
      .string()
      .regex(/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/)
      .or(z.literal(''))
      .optional(),
    deliveryRegions: businessSchema.shape.deliveryRegions.optional(),
    mediaAssetId: z.string().uuid().nullable().optional(),
    thumbnailAssetId: z.string().uuid().nullable().optional(),
    mediaAssetIds: z.array(z.string().uuid()).max(6).optional(),
    costPlanning: z
      .object({
        mode: z.enum(['automatic', 'manual']),
        returnRateSource: z.enum(['assumed', 'measured']),
        returnShippingCost: amount,
        courierCharge: amount.optional(),
        customerDeliveryCharge: amount.optional(),
        profitReserveRatio: z.number().min(0).max(0.8),
        acknowledged: z.boolean(),
      })
      .strict()
      .optional(),
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
            format: z.enum(['single', 'carousel']).optional(),
            cards: z.array(carouselCardSchema).min(2).max(10).optional(),
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
