import { stdin as input, stdout as output } from 'node:process';

export async function readPassword(prompt: string) {
  if (!input.isTTY || !output.isTTY) throw new Error('Exécuter cette commande dans un terminal interactif.');
  output.write(prompt);
  input.setRawMode(true);
  input.resume();
  let value = '';
  return new Promise<string>((resolve, reject) => {
    const onData = (chunk: Buffer) => {
      const character = chunk.toString('utf8');
      if (character === '\r' || character === '\n') {
        cleanup();
        output.write('\n');
        resolve(value);
      } else if (character === '\u0003') {
        cleanup();
        reject(new Error('Commande annulée.'));
      } else if (character === '\u007f') {
        value = value.slice(0, -1);
      } else if (!character.startsWith('\u001b')) {
        value += character;
      }
    };
    const cleanup = () => {
      input.off('data', onData);
      input.setRawMode(false);
      input.pause();
    };
    input.on('data', onData);
  });
}

export async function askNewPassword() {
  const password = await readPassword('Nouveau mot de passe (12–128 caractères) : ');
  const confirmation = await readPassword('Confirmer le mot de passe : ');
  if (password !== confirmation) throw new Error('Les mots de passe ne correspondent pas.');
  if (password.length < 12 || password.length > 128) throw new Error('Le mot de passe doit contenir entre 12 et 128 caractères.');
  return password;
}
