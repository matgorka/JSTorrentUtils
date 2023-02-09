const xt = uri => /^urn:([A-Z\d]+(?::+[A-Z\d]+)*:*):(.*)/i.exec(uri).slice(1);

const parseAddress = (validate, param, addr, isSimpleAddr) => {
  let protocol,
      rest,
      urlData,
      interAddr; /* internationalized address */

  if (isSimpleAddr)
    addr = "http://" + addr;

  [protocol, rest] = /^(.*?:\/*)(.*)/.exec(addr).slice(1);
  urlData          = new URL("http://" + rest);

  if (["udp://", "tcp://"].includes(protocol) && urlData.port === "")
    throw new Error();

  if (isSimpleAddr)
    protocol = "";

  interAddr = protocol + urlData.href.slice(7);

  if (!addr.endsWith("/"))
    interAddr = interAddr.replace(/\/$/, "");

  if (!validate(param, protocol))
    throw new Error();

  return interAddr;
};

const set = (validate, o, key, value) => {
  let usedProtocols = [], // for xt
      protocol,           // for xt
      hash,               // for xt
      newSelections,      // for so
      bitfield      = [], // for so
      arr           = [], // for so
      range,              // for so
      l,                  // for so and x.pe
      r,                  // for so and x.pe
      ip,                 // for x.pe
      segments,           // for x.pe
      err,                // for x.pe
      host,               // for x.pe
      byte,               // for x.pe
      i;

  try {
    key = key.toLowerCase();

    if (typeof value == "object")
      value = value.valueOf();
  } catch(err) {
    return;
  }

  if (!["number", "string"].includes(typeof value) || value === "")
    return;

  value = decodeURIComponent(value);

  switch (key) {
    /* non-repeatable parameters */
    case "xl":
      if (parseInt(value) != value || value < 0)
        return;
      /* BREAK THROUGH */

    case "dn":
      if (!validate(key, value))
        return;

      o[key] = [ value ];
      return;

    /* repeatable parameters combinable into single ones */
    case "kt":
      if (!o.kt)
        o.kt = [ "" ];

      value    = value.toLowerCase();
      /* all keywords - old and new */
      keywords = o.kt[0] + "+" + value;
      /* fixing doubled '+' characters and repeating keywords */
      keywords = [...new Set(keywords.split(/[\+\s]+/))].filter(k => k !== "")
      /* getting the new keywords */
        .filter(keyword => !o.kt[0].split("+").includes(keyword))
      /* and validating them */
        .filter(keyword => validate(key, keyword));

      /* adding new keywords to the list */
      o.kt = [
        o.kt[0].split("+").concat(keywords).join("+").replace(/^\+/, "")
      ];
      return;

    case "so":
      if (!o.so)
        o.so = [ "" ];

      value = o.so[0] + "," + value;

      for (range of value.split(",")) {
        if (!range || !/^\d+(?:-\d+)?$/.test(range))
          continue;

        range = range.split("-");
        l     = range[0] * 1;
        r     = range[1] || range[0];

        if (l > r)
          [r, l] = [l, r];

        for (i = l; i <= Math.min(r, 1e6); ++i)
          bitfield[i] = 1;
      }

      for (l = -1, r = 0; r <= bitfield.length; ++r) {
        if (bitfield[r]) {
          if (l < 0)
            l = r;
        } else if (l >= 0) {
          if (r - l > 1)
            l += "-" + (r - 1);

          arr.push(l);
          l = -1;
        }
      }

      if (!validate(key, arr.join()))
        return;

      o.so = [ arr.join() ];
      return;

    /* repeatable but once per protocol: xt parameter */
    case "xt":
      try {
        usedProtocols = o.xt.map(uri => xt(uri))
      } catch(err) {
      }

      try {
        [protocol, hash] = xt(value);
      } catch(err) {
        return;
      }

      if (!validate(key, [protocol, hash]))
        return;

      i = usedProtocols.indexOf(protocol);

      if (i >= 0) {
        o.xt[i] = value;
        return;
      }

      break;

    /* repeatable address parameters */
    case "x.pe":
      /* checking if port is given - it is neccessary */
      try {
        value = parseAddress(validate, key, value, true);
        host  = /(.*):\d+$/.exec(value)[1];
      } catch(err) {
        return;
      }

      /* IPv4 support */
      if (/^\d+(\.\d+){3}$/.test(host)) {
        for (byte of host.split("."))
          if (byte > 255)
            return;
      } else {
        /* IPv6 support */
        try {
          ip          = /^\[([\dA-F:]+)\]$/i.exec(host)[1];
          [l, r, err] = ip.split("::");

          if (err || /:::/.test(ip))
            return;

          segments = l.split(":");

          if (r !== undefined) {
            r = r.split(":");

            segments = segments
              .concat(new Array(8 - segments.length - r.length).fill(0), r);
          }

          if (segments.length < 8)
            return;

          for (i in segments) {
            if (segments[i] == "")
              segments[i] = 0;

            if (segments[i].length > 4)
              return;
          }
        } catch(err) {
          /* hostname */
          if (!/^[A-Z\d]([A-Z\d-]*[A-Z\d])?(\.[A-Z\d]([A-Z\d-]*[A-Z\d])?)*$/i.test(host))
            return;

          if (!/[A-Z-]/i.test(host.split(".").pop()))
            return;
        }
      }

      if (o[key] && o[key].includes(value))
        return;

      break;

    case "tr":
    case "ws":
    case "as":
    case "xs":
      try {
        value = parseAddress(validate, key, value);
      } catch(err) {
        return;
      }

      if (o[key] && o[key].includes(value))
        return;

      break;

    default:
      if (!validate(key, value))
        return;
  }

  if (o[key])
    o[key].push(value)
  else
    o[key] = [ value ];
};

function MagnetURI(uri) {
  this._params   = {};
  this._validate = () => 1;

  try {
    /^magnet\:\?(.*)/.exec(uri)[1]
      .split("&")
      .map(param => param.split("=").map(x => decodeURIComponent(x)))
      .forEach(([key, value]) => set(this._validate, this._params, key, value));
  } catch(err) {
    throw new Error("Invalid magnet uri.");
  }
}
