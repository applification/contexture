import { parseTurtleWithWarnings } from '../parse';
import { serializeToTurtle } from '../serialize';
import type { FormatAdapter } from './index';

export const turtleAdapter: FormatAdapter = {
  extensions: ['.ttl'],
  mimeType: 'text/turtle',
  parse: (content) => parseTurtleWithWarnings(content),
  serialize: (ontology) => serializeToTurtle(ontology),
};
