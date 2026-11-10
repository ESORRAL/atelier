// Extra capture (for FINDINGS): how messages from a subagent are tagged.
import { query, baseOptions, capture } from './lib.mjs';

const log = capture('subagent');
const tags = [];
for await (const msg of query({
  prompt: 'Delegate to a general-purpose subagent the task: "reply with the word hi, use no tools". Then relay its answer.',
  options: baseOptions({
    forwardSubagentText: true, // default forwards only the subagent's tool_use/tool_result blocks
    canUseTool: async (toolName, input, { signal, ...rest }) => {
      log('canUseTool', { toolName, input, options: rest });
      return { behavior: 'allow', updatedInput: input };
    },
  }),
})) {
  log('message', msg);
  tags.push(`${msg.type}${msg.subtype ? '/' + msg.subtype : ''} parent=${msg.parent_tool_use_id ?? '-'}`);
}
console.log(tags);
