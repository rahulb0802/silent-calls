import {spawn} from 'node:child_process';
import path from 'node:path';
import electron from 'electron';
// On macOS use the same app identity as development for system permission checks.
const child=process.platform==='darwin'
  ? spawn('/usr/bin/open',['-n',path.resolve(path.dirname(electron),'../..'),'--args',process.cwd()],{stdio:'inherit'})
  : spawn(electron,['.'],{stdio:'inherit'});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code??0;});
process.on('SIGINT',()=>child.kill());
process.on('SIGTERM',()=>child.kill());
