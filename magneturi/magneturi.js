const xt = uri => /^urn:([A-Z0-9]+(?::+[A-Z0-9]+)*:*):/i.exec(uri)[1];

const rawPush = (o, key, value) =>
  o[key] ? o[key].push(value) : o[key] = [ value ];

const push = (o, key, value) => {
  let usedProtocols = [],
      protocol,
      i;

  try {
    switch (key) {
      /* non-repeatable parameters */
      case "xl":
        if (parseInt(value) != value || value < 0)
          return;
        /* BREAK THROUGH */

      case "dn":
        o[key] = [ value + "" ];
        return;

      /* repeatable parameters combined into single one */
      case "kt":
        if (!o.kt)
          o.kt = [ "" ];

        o.kt = [
          [...new Set((o.kt[0] + "+" + value).split(/[\+\s]+/))]
            .join("+").replace(/^\+|\+$/g, "")
        ];
        return;

      case "so":
        // TO DO!
        return;

      /* XT */
      case "xt":
        try {
          usedProtocols = o.xt.map(uri => xt(uri))
        } catch(err) {
        }

        protocol = xt(value);
        i        = usedProtocols.indexOf(protocol);

        if (i >= 0) {
          o.xt[i] = value;
          return;
        }

        break;
    }

    rawPush(o, key, value);
  } catch(err) {
  }
};

function MagnetURI(uri) {
  try {
    /^magnet\:\?(.*)/.exec(uri)[1]
      .split("&")
      .map(param => param.split("=").map(x => decodeURIComponent(x)))
      .forEach(([key, value]) => push(this.params, key, value));
  } catch(err) {
    throw new Error("Invalid magnet uri.");
  }
}
