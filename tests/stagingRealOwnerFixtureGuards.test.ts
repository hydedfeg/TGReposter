import test from "node:test";
import assert from "node:assert/strict";
import {requireDistinctOwnerFixtures,assertCampaignDetailRead} from "../scripts/stagingRealOwnerFixtureGuards";
const ids=[
 "11111111-1111-4111-8111-111111111111",
 "22222222-2222-4222-8222-222222222222",
 "33333333-3333-4333-8333-333333333333",
 "44444444-4444-4444-8444-444444444444"
];
const item=(id:string)=>({id});
test("genuine staging acceptance requires nonempty distinct source AND campaign fixtures",()=>{
 assert.deepEqual(requireDistinctOwnerFixtures(
  [item(ids[0])],[item(ids[1])],[item(ids[2])],[item(ids[3])]
 ),{aliceCampaignId:ids[2],bobCampaignId:ids[3]});
 assert.throws(()=>requireDistinctOwnerFixtures(
  [item(ids[0])],[],[item(ids[2])],[item(ids[3])]
 ),/INCONCLUSIVE/);
 assert.throws(()=>requireDistinctOwnerFixtures(
  [item(ids[0])],[item(ids[1])],[item(ids[2])],[]
 ),/INCONCLUSIVE/);
});
test("real-account acceptance rejects shared IDs and malformed fixture rows",()=>{
 assert.throws(()=>requireDistinctOwnerFixtures(
  [item(ids[0])],[item(ids[0])],[item(ids[2])],[item(ids[3])]
 ),/CROSS_OWNER_LEAK/);
 assert.throws(()=>requireDistinctOwnerFixtures(
  [item(ids[0])],[item(ids[1])],[item(ids[2])],[item(ids[2])]
 ),/CROSS_OWNER_LEAK/);
 assert.throws(()=>requireDistinctOwnerFixtures(
  [item(ids[0]),item(ids[0])],[item(ids[1])],[item(ids[2])],[item(ids[3])]
 ),/Duplicate/);
 assert.throws(()=>requireDistinctOwnerFixtures(
  [{}],[item(ids[1])],[item(ids[2])],[item(ids[3])]
 ),/invalid.*UUID/);
});
test("own campaign detail is 200 and foreign detail always generic 404 with no data",()=>{
 assert.doesNotThrow(()=>assertCampaignDetailRead(200,{campaign:{id:ids[2]}},ids[2],true));
 assert.doesNotThrow(()=>assertCampaignDetailRead(404,{code:"NOT_FOUND",error:"Not found"},ids[2],false));
 assert.throws(()=>assertCampaignDetailRead(200,{campaign:{id:ids[2]}},ids[2],false),/CROSS_OWNER_LEAK/);
 assert.throws(()=>assertCampaignDetailRead(404,{code:"NOT_FOUND",campaign:{id:ids[2]}},ids[2],false),/CROSS_OWNER_LEAK/);
 assert.throws(()=>assertCampaignDetailRead(200,{campaign:{id:ids[0]}},ids[2],true),/mismatched/);
});
