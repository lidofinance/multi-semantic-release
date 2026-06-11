import chalk from 'chalk';

const { red, blue, green, yellow, gray } = chalk;

const ConsoleCss = {
  Error: red,
  LOG: blue,
  Info: gray,
  Warning: yellow,
  Success: green,
};

export const consoleLog = (
  message: string,
  type: keyof typeof ConsoleCss = 'Info',
): void => {
  const color = ConsoleCss[type];

  globalThis.console.log(color(message));
};
