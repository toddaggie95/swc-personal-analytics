import rules from'./accounting-rules.json'with{type:'json'};
const name=s=>String(s).toLowerCase().replace(/\s+/g,' ');
const groups=Object.fromEntries(Object.entries(rules.groups).map(([k,v])=>[k,new Set(v.map(name))]));
export function accountTypeCounts(rows,catalog,{slabs,taxFraction}){
 if(!Number.isSafeInteger(slabs)||slabs<=0||!Number.isFinite(taxFraction)||taxFraction<0||taxFraction>1)throw Error('accounting-parameters');
 const types=new Map(catalog.map(t=>[t.uid,t])),seen=new Set(),excluded=[],unknown=[],totals={facilities:0,jobs:0,flats:0,area:0},areas=Object.fromEntries(Object.keys(groups).map(k=>[k,0]));
 let microjobs=0;
 for(const row of rows){
  if(row.layer!=='actual'){excluded.push(row);continue;}
  if(!/^4:\d+$/.test(row.typeUid)||seen.has(row.typeUid)||!Number.isSafeInteger(row.count)||row.count<0)throw Error('accounting-count');seen.add(row.typeUid);
  const t=types.get(row.typeUid);if(!t?.economicFieldsComplete){unknown.push(row);continue;}
  totals.facilities+=row.count;microjobs+=Math.round(t.jobs*1e6)*row.count;totals.flats+=t.flats*row.count;totals.area+=t.area*row.count;
  for(const[k,g]of Object.entries(groups))if(g.has(name(t.name)))areas[k]+=t.area*row.count;
 }
 totals.jobs=microjobs/1e6;
 const er=totals.jobs/(totals.flats+0.1),cl=totals.area/(slabs*484),bcr=areas.s1+areas.s2?cl*areas.s1/(areas.s1+areas.s2)*Math.exp(taxFraction)/0.83:null;
 const finalCrime=bcr==null?null:bcr*(0.8*taxFraction+0.96),basePopulation=totals.flats>0?Math.log(totals.flats)*totals.flats**2+totals.flats:null;
 const populationModifier=taxFraction<=0.05?-3*taxFraction+1.15:-0.9*taxFraction+1.05;
 const moraleModifier=taxFraction<=0.05?-4*taxFraction+1.2:-0.7*taxFraction+1.04;
 const moraleDenominator=areas.s4+2*areas.s5+4*areas.s6;
 const rawBaseMorale=moraleDenominator&&finalCrime!=null?(1-finalCrime*taxFraction*cl)*areas.s3/moraleDenominator:null;
 return{schemaVersion:1,ruleSources:rules.sources,totals,groupAreas:areas,parameters:{slabs,taxFraction},excludedNonActualRows:excluded,unknownTypes:unknown,
  derived:{employmentRate:er,civilisationFraction:cl,baseCrimeFraction:bcr,finalCrimeFraction:finalCrime,basePopulation,populationModifier,predictedPopulation:basePopulation==null?null:basePopulation*populationModifier,
   rawBaseMorale,rawFinalMorale:rawBaseMorale==null?null:rawBaseMorale*moraleModifier,
   planetaryIncomeModifier:bcr==null?null:1.65*Math.atan((-(er**2)+3*er)/2-taxFraction-bcr-0.25)},
  limitations:['Totals have the scope and currency of supplied counts, not an automatic completeness certificate.',rules.rounding,'Raw morale uses final crime in the published CR term; do not equate unclamped output with the displayed morale.','No owner, manager, income generation date or secret FIM/MNSF is inferred by this arithmetic.']};
}
