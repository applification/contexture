/**
 * Stdlib registry — enumerates all five namespaces with their IR sidecar
 * loaders and their hand-written Zod modules.
 *
 * The desktop app reads `IR_LOADERS` at startup (issue #91) to populate
 * ref resolution for qualified names like `common.Email`. The
 * `HAND_ZOD_BY_NAMESPACE` map feeds the parity tests that prove the IR
 * round-trip is semantically equivalent to the hand-written Zod.
 *
 * No Electron / filesystem imports here — this module has to run in
 * jsdom unit tests, Node scripts, and the Electron main process.
 */

import * as commonZ from './common';
import commonIR from './common.contexture.json' with { type: 'json' };
import * as contactZ from './contact';
import contactIR from './contact.contexture.json' with { type: 'json' };
import * as identityZ from './identity';
import identityIR from './identity.contexture.json' with { type: 'json' };
import * as moneyZ from './money';
import moneyIR from './money.contexture.json' with { type: 'json' };
import * as placeZ from './place';
import placeIR from './place.contexture.json' with { type: 'json' };

/**
 * Minimal IR envelope — we only surface `version` + `types` here so
 * consumers don't have to depend on the desktop package's full types.
 * The desktop app re-casts each entry to its richer `Schema` type at
 * load time.
 */
export interface StdlibIR {
  version: '1';
  types: Array<{ kind: string; name: string; [k: string]: unknown }>;
  metadata?: { name?: string; description?: string };
}

export type Namespace = 'common' | 'identity' | 'place' | 'money' | 'contact';

export const NAMESPACES: readonly Namespace[] = [
  'common',
  'identity',
  'place',
  'money',
  'contact',
] as const;

export const IR_BY_NAMESPACE: Record<Namespace, StdlibIR> = {
  common: commonIR as unknown as StdlibIR,
  identity: identityIR as unknown as StdlibIR,
  place: placeIR as unknown as StdlibIR,
  money: moneyIR as unknown as StdlibIR,
  contact: contactIR as unknown as StdlibIR,
};

export const HAND_ZOD_BY_NAMESPACE = {
  common: commonZ,
  identity: identityZ,
  place: placeZ,
  money: moneyZ,
  contact: contactZ,
} as const;
