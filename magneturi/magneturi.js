const xt = uri => /^urn:([A-Z\d]+(?::+[A-Z\d]+)*:*):/i.exec(uri)[1];

const set = (o, key, value) => {
  let usedProtocols = [], // for xt
      protocol,           // for xt
      bitfield      = [], // for so
      arr           = [], // for so
      range,              // for so
      l,                  // for so
      r,                  // for so
      i;

  value = decodeURIComponent(value);

  try {
    switch (key) {
      /* non-repeatable parameters */
      case "xl":
        if (parseInt(value) != value || value < 0)
          return;
        /* BREAK THROUGH */

      case "dn":
        o[key] = [ value ];
        return;

      /* repeatable parameters combinable into single ones */
      case "kt":
        if (!o.kt)
          o.kt = [ "" ];

        o.kt = [
          [...new Set((o.kt[0] + "+" + value).split(/[\+\s]+/))]
            .join("+").replace(/^\+|\+$/g, "")
        ];
        return;

      case "so":
        if (!o.so)
          o.so = [ "" ];

        for (range of (o.so[0] + "," + value).split(",")) {
          if (!range || !/^\d+(?:-\d+)?$/.exec(range))
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

        o.so = [ arr.join() ];
        return;

      /* repeatable but once per protocol: xt parameter */
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

      /* repeatable address parameters */
      case "x.pe":
        /* IPv4 support */
        if (/^\d+(\.\d+){3}:\d+$/.exec(value)) {
          for (byte of value.split(":").shift().split("."))
            if (byte > 255)
              return;
        } else {
          /* IPv6 support */
          try {
            ip = /^\[([\dA-F:]+)\]:\d+$/i.exec(value)[1];
            n  = [...ip.matchAll(/:/g)].length;

            if (
              (!/::/.exec(ip) && n != 7) ||
              /*n < 2 ||*/ n > 7 || /::.*::|:::/.exec(ip)
            ) {
              return;
            }

            for (segment of ip.split(":")) {
              if (segment.length > 4)
                return;
            }
          } catch(err) {
            /* hostname */
            try {
              hostname = /^([A-Z\d](?:[A-Z\d-]*[A-Z\d])?(?:\.[A-Z\d](?:[A-Z\d-]*[A-Z\d])?)*):\d+$/i.exec(value)[1];

              if (!/[A-Z]/i.exec(hostname.split(".").pop()))
                return;
            } catch(err) {
              return;
            }
          }
        }

        console.log(value);
        return;
        break;

      case "tr":
      case "ws":
      case "as":
      case "xs":
        try {
          new URL(value);
        } catch(err) {
          return;
        }

        if (o[key].includes(value))
          return;

        break;
    }

    if (o[key])
      o[key].push(value)
    else
      o[key] = [ value ];
  } catch(err) {
  }
};

function MagnetURI(uri) {
  try {
    /^magnet\:\?(.*)/.exec(uri)[1]
      .split("&")
      .map(param => param.split("=").map(x => decodeURIComponent(x)))
      .forEach(([key, value]) => set(this.params, key, value));
  } catch(err) {
    throw new Error("Invalid magnet uri.");
  }
}

var x={};
