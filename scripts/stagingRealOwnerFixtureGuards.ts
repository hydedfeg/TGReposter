/**
 * Positive evidence for a PRIVATE, read-only two-account staging acceptance.
 * Authenticated resource collection ownership is inferred only through the
 * live API. Never print account, bearer, post or campaign details.
 */
import assert from "node:assert/strict";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ids(rows:readonly unknown[], resource:string, account:string):string[] {
  assert.ok(rows.length>0,
    "INCONCLUSIVE: "+account+" has no "+resource+" fixtures; choose the two staging fixture owners.");
  const values=rows.map(row=>{
    assert.ok(row&&typeof row==="object"&&!Array.isArray(row),
      "Malformed "+resource+" fixture.");
    const id=(row as Record<string,unknown>).id;
    assert.ok(typeof id==="string"&&UUID.test(id),
      "Missing or invalid "+resource+" fixture UUID.");
    return id as string;
  });
  assert.equal(new Set(values).size,values.length,
    "Duplicate "+resource+" fixture identifiers.");
  return values;
}
export function requireDistinctOwnerFixtures(
  aliceSources:readonly unknown[],bobSources:readonly unknown[],
  aliceCampaigns:readonly unknown[],bobCampaigns:readonly unknown[]
):{aliceCampaignId:string;bobCampaignId:string} {
  const sa=ids(aliceSources,"source channels","Alice");
  const sb=ids(bobSources,"source channels","Bob");
  const ca=ids(aliceCampaigns,"promotion campaigns","Alice");
  const cb=ids(bobCampaigns,"promotion campaigns","Bob");
  assert.ok(sa.every(id=>!sb.includes(id)),
    "CROSS_OWNER_LEAK: source channel row shared between sessions.");
  assert.ok(ca.every(id=>!cb.includes(id)),
    "CROSS_OWNER_LEAK: promotion campaign row shared between sessions.");
  return {aliceCampaignId:ca[0],bobCampaignId:cb[0]};
}
export function assertCampaignDetailRead(
  status:number, body:Record<string,any>|null, expectedId:string,
  ownAccount:boolean
):void {
  if(ownAccount){
    assert.equal(status,200,"Own campaign detail not available.");
    assert.equal(body?.campaign?.id,expectedId,"Own campaign detail has a mismatched ID.");
  }else{
    assert.equal(status,404,"CROSS_OWNER_LEAK: foreign campaign detail is not 404.");
    assert.equal(body?.code,"NOT_FOUND","Foreign campaign detail lacks generic NOT_FOUND.");
    assert.ok(!body?.campaign&&!body?.posts&&!body?.deliveries,
      "CROSS_OWNER_LEAK: foreign campaign detail exposed private resources.");
  }
}
