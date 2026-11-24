import {readFileSync} from 'node:fs';
import '../public/journal-model.js';

// Read a private workspace file and an explicitly approved revision from stdin.
// The caller must update GitHub using the exact blob SHA of the input file.
try {
 const file=process.argv[2];
 if(!file)throw Error('Podaj ścieżkę do prywatnej kopii dziennika.');
 const model=globalThis.JournalModel;
 const archive=JSON.parse(readFileSync(file,'utf8'));
 const entry=model.revision(JSON.parse(readFileSync(0,'utf8')));
 if(!['chatgpt','migration'].includes(entry.source))throw Error('Wymagane źródło ChatGPT lub migracja.');
 const next=model.append(archive,entry);
 process.stdout.write(JSON.stringify(next.archive)+'\n');
} catch(error) {
 process.stderr.write(error.message+'\n');
 process.exitCode=1;
}
