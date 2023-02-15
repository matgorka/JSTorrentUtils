/* example validator */
let validateXT = (key, [protocol, hash]) => {
  if (key != "xt")
    return 1;

  switch (protocol) {
    case "btmh":
    case "btih":
      if (/[^A-F\d]/i.test(hash))
        return 0;
  }

  if (protocol == "btmh")
    return hash.length == 64;

  if (protocol == "btih")
    return hash.length == 40;

  return 1;
};
