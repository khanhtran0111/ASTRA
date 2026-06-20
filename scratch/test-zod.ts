import { z } from 'zod';

const schema = z.object({ a: z.string() });
console.log('Shape:', schema.shape);
console.log('Keys:', Object.keys(schema.shape));
