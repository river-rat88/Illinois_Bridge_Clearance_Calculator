import { createHenryService } from '../src/henry-service.js';
import { createMorrisService } from '../src/morris-service.js';
import { createEjeService } from '../src/eje-service.js';
const definitions=[['Henry',createHenryService,'HENRY_DATA_DIR'],['Morris',createMorrisService,'MORRIS_DATA_DIR'],['EJE / Dresden tailwater',createEjeService,'EJE_DATA_DIR']];
const results=await Promise.allSettled(definitions.map(async([name,create,variable])=>{
 const service=create(process.env[variable]?{directory:process.env[variable]}:{});
 const receipt=await service.get({force:true});const r=receipt.result;
 console.log(JSON.stringify({name,asOf:r.asOf,stage:r.stage.status,valueFt:r.stage.valueFt,observedAt:r.stage.observedAt,datum:r.stage.verticalDatum??'STAGE_ABOVE_GAUGE_ZERO',late:r.stage.late,clearance:r.clearance.status,clearanceFt:r.clearance.valueFt,forecast:r.forecast.status,receiptId:receipt.receiptId}));
 if(r.stage.status!=='AVAILABLE')process.exitCode=1;
}));
for(const r of results)if(r.status==='rejected'){console.error(r.reason.message);process.exitCode=1;}
