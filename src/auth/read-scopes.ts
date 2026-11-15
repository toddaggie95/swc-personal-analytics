// Explicit read permissions only. Source: official permissions catalog, 2026-11-15.
// https://www.swcombine.com/ws/developers/permissions/
import type {AllScopes} from 'swcombine-sdk';
const inventoryKinds=['ships','vehicles','stations','cities','facilities','planets',
 'items','npcs','droids','materials','creatures'] as const;
const identity=['character_auth','character_read'];
export function readScopes(profile:string):AllScopes[]{
 if(profile==='planning')return [...new Set([...identity,
  'character_privileges','character_skills','character_events','faction_read',
  'personal_inv_overview','faction_inv_overview',
  ...['ships','stations','cities','facilities','planets','materials'].flatMap(kind=>
   ['personal','faction'].map(owner=>`${owner}_inv_${kind}_read`))])].sort() as AllScopes[];
 if(profile!=='all-read')throw Error('Unknown read-only authorization profile.');
 return [...new Set([...identity,
  'character_stats','character_privileges','character_skills','character_credits',
  'character_force','character_location','character_events','character_combat_reports',
  'messages_read','personal_inv_overview','faction_inv_overview','faction_read',
  'faction_members','faction_stocks','faction_credits_read','faction_budgets_read',
  'faction_datacards_read','faction_combat_reports',
  ...inventoryKinds.flatMap(kind=>['personal','faction'].flatMap(owner=>
   [`${owner}_inv_${kind}_read`,`${owner}_inv_${kind}_tags_read`]))])].sort() as AllScopes[];
}
