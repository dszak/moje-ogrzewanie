// Candidate assembly only. Verify the active production gas source before deployment.
import legacy from './gas-pr27.mjs';
import {createJournalHandler} from './journal.mjs';

const journal=createJournalHandler();
export default {
 fetch(request,env,context){
  return new URL(request.url).pathname==='/v1/journal'
   ?journal(request,env):legacy.fetch(request,env,context);
 }
};
