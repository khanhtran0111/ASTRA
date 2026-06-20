import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';

const schema = z.object({
  formatMapStr: z
    .string()
    .describe(
      'A JSON string mapping skillName to LearningFormat enum string. Example: "{\\"CI/CD\\": \\"ONLINE_COURSE\\"}"',
    ),
});

console.log(JSON.stringify(zodToJsonSchema(schema, 'mySchema'), null, 2));
