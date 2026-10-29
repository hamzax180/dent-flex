import { z } from "zod";

/** Minimal Zod → JSON Schema conversion for the flat tool argument objects we expose. */
export function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  const def = schema._def as { typeName: string };
  switch (def.typeName) {
    case "ZodObject": {
      const shape = (schema as z.ZodObject<z.ZodRawShape>).shape;
      const properties: Record<string, unknown> = {};
      const required: string[] = [];
      for (const [k, v] of Object.entries(shape)) {
        properties[k] = zodToJsonSchema(v as z.ZodTypeAny);
        if (!(v as z.ZodTypeAny).isOptional()) required.push(k);
      }
      return { type: "object", properties, required, additionalProperties: false };
    }
    case "ZodOptional":
      return zodToJsonSchema((schema as z.ZodOptional<z.ZodTypeAny>).unwrap());
    case "ZodString":
      return { type: "string" };
    case "ZodNumber":
      return { type: "number" };
    case "ZodBoolean":
      return { type: "boolean" };
    case "ZodEnum":
      return { type: "string", enum: (schema as z.ZodEnum<[string, ...string[]]>).options };
    default:
      return {};
  }
}
