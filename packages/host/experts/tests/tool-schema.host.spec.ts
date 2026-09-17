import { expect, it } from 'vitest'
import { assertObjectJsonSchema, assertSupportedJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import { registerExpertTool } from '../src/tool.ts'

it('registers wire schemas with required input and output fields', () => {
  registerExpertTool({
    tools: {
      register(definition) {
        const { parameters, output } = definition as { parameters: unknown; output: { schema: unknown } }
        assertObjectJsonSchema(parameters)
        expect(validateJsonSchemaValue(parameters, { expert: 'Reviewer', task: 'Review' })).toEqual([])
        expect(validateJsonSchemaValue(parameters, { expert: 'Reviewer' })).not.toEqual([])
        expect(validateJsonSchemaValue(parameters, { task: 'Review' })).not.toEqual([])
        assertSupportedJsonSchema(output.schema)
        expect(validateJsonSchemaValue(output.schema, { expert: 'Reviewer', text: 'Done' })).toEqual([])
        expect(validateJsonSchemaValue(output.schema, { expert: 'Reviewer' })).not.toEqual([])
        expect(validateJsonSchemaValue(output.schema, { text: 'Done' })).not.toEqual([])
        return () => {}
      },
    },
    subagents: { start: async () => { throw new Error('Schema validation must not dispatch') } },
  }, { list: async () => [] }, [])
})
