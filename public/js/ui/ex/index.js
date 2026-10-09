import * as choice from './choice.js';
import * as type from './type.js';
import * as order from './order.js';
import * as bucket from './bucket.js';
import * as table from './table.js';
import * as match from './match.js';
import * as errorhunt from './errorhunt.js';
import * as flash from './flash.js';
import * as speak from './speak.js';

export const COMPONENTS = { choice, picture: choice, type, order, bucket, table, match, errorhunt, flash, speak };
export function mountExercise(host, ex, api) {
  const mod = COMPONENTS[ex.type];
  if (!mod) throw new Error(`no component for exercise type "${ex.type}"`);
  return mod.mount(host, ex, api) || {};
}
