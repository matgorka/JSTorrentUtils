/* example validator */
let validateXT = (key, [protocol, hash]) => {
  if (key != "xt")
    return 1;

  if (protocol == "btmh")
    return hash.length == 68 && !/[^A-F\d]/i.test(hash) && hash.startsWith("1220");

  if (protocol == "btih")
    return hash.length == 40 && !/[^A-F\d]/i.test(hash);

  return 1;
};
