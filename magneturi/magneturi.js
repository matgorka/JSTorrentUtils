(g => {
  const paramsList = [
    "xt", "dn", "xl", "kt", "so", "tr", "xs", "as", "ws", "x.pe"
  ];

  const parseXT = uri =>
    /^urn:([A-Z\d]+(?::+[A-Z\d]+)*:*):(.*)/i.exec(uri).slice(1);

  const getIDNAddress = (addr, hasNoProtocol) => {
    let protocol,
        rest,
        urlData,
        urlData2,
        sliceI     = 7,
        idnAddr;

    if (hasNoProtocol)
      addr = "http://" + addr;

    [protocol, rest] = /^(\w+:\/*)(.*)/.exec(addr).slice(1);
    urlData          = new URL("http://" + rest);
    urlData2         = new URL("https://" + rest);

    if (!urlData.port && urlData2.port) {
      urlData = urlData2;
      sliceI  = 8;
    }

    if (["udp://", "tcp://"].includes(protocol) && urlData.port === "")
      throw new Error();

    if (hasNoProtocol)
      protocol = "";

    idnAddr = protocol + urlData.href.slice(sliceI);

    if (!addr.endsWith("/"))
      idnAddr = idnAddr.replace(/\/$/, "");

    return [ idnAddr, protocol ];
  };

  const parseXPE = value => {
    let protocol,
        l,
        r,
        ip,
        segments,
        err,
        host,
        byte,
        i;

    /* converting to IDN + checking if port is given (it is neccessary) */
    try {
      [value, protocol] = getIDNAddress(value, true);
      host              = /(.*):\d+$/.exec(value)[1];
    } catch(err) {
      return;
    }

    /* IPv4 support */
    if (/^\d+(\.\d+){3}$/.test(host)) {
      for (byte of host.split("."))
        if (byte > 255)
          return;

      return value;
    }

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

    return value;
  };

  const parseRange = (rangeStr, bitfield, booleanValue, arr) => {
    let range,
        l,
        r,
        i;

    arr.splice(0, arr.length);

    for (range of rangeStr.split(",")) {
      if (!range || !/^\d+(-\d+)?$/.test(range))
        continue;

      range = range.split("-");
      l     = range[0] * 1;
      r     = range[1] || range[0];

      if (l > r)
        [r, l] = [l, r];

      for (i = l; i <= Math.min(r, 1e6); ++i)
        bitfield[i] = booleanValue;
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
  };

  const parseSO = (oldRange, newRange) => {
    let bitfield = [],
        arr      = [];

    parseRange(oldRange + "," + newRange, bitfield, 1, arr);
    newRange = arr.join();
    parseRange(oldRange, bitfield, 0, arr);
    return [ newRange, arr.join() ];
  };

  const modifyParamsList = (magnetObj, o, key, value) => {
    const validate = str => {
      let validateStr,
          validateFn;

      if (str !== undefined)
        validateList = [ str ];

      for (validateStr of validateList)
        for (validateFn of magnetObj._validators)
          if (!validateFn(key, validateStr))
            return 0;

      if (str !== undefined)
        validateList = [];

      return 1;
    };

    let usedProtocols = [], // for xt
        protocol,           // for xt/tr/ws/as/xs
        hash,               // for xt
        keywords      = [], // for kt
        newRange,           // for so
        validateList  = [],
        oldValue,
        parser,
        parsedValue,
        isRepeatable  = 1,
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

    if (key != "kt")
      value = decodeURIComponent(value);

    switch (key) {
      /* non-repeatable parameters */
      case "xl":
        if (parseInt(value) != value || value < 0)
          return;
        /* BREAK THROUGH */

      case "dn":
        validateList.push(value);
        isRepeatable = 0;
        break;

      /* repeatable parameters combinable into single ones */
      case "kt":
        if (!o.kt)
          o.kt = [ "" ];

        value    = value.toLowerCase();
        /* all keywords - old and new */
        keywords = o.kt[0] + "+" + value;
        /* fixing doubled '+' characters and repeating keywords */
        keywords = [...new Set(keywords.split(/[\+\s]+/))]
          .filter(k => k !== "")
        /* getting the new keywords */
          .filter(keyword => !o.kt[0].split("+").includes(keyword))
        /* and validating them */
          .filter(keyword => validate(keyword));

        /* adding new keywords to the list */
        value = o.kt[0].split("+").concat(keywords)
          .join("+").replace(/^\+/, "");

        o.kt = [ value ];
        return value;

      case "so":
        if (!o.so)
          o.so = [ "" ];

        [value, newRange] = parseSO(o.so[0], value);

        if (newRange.length && !validate(newRange))
          return;

        o.so = [ value ];
        return value;

      /* repeatable but once per protocol: xt parameter */
      case "xt":
        try {
          usedProtocols = o.xt.map(uri => parseXT(uri)[0]);
        } catch(err) {
        }

        try {
          [protocol, hash] = parseXT(value);
        } catch(err) {
          return;
        }

        if (!validate([protocol, hash]))
          return;

        i = usedProtocols.indexOf(protocol);

        if (i >= 0) {
          o.xt[i] = value;
          return value;
        }

        break;

      /* repeatable address parameters */
      case "x.pe":
        value = parseXPE(value);
        validateList.push(value);
        break;

      case "tr":
      case "ws":
      case "as":
      case "xs":
        try {
          [value, protocol] = getIDNAddress(value);
        } catch(err) {
          return;
        }

        validateList.push(protocol);
        break;

      default:
        try {
          oldValue = o[key][0];
        } catch(err) {
        }

        try {
          for (parser of magnetObj._parsers)
            if (parsedValue = parser(key, value, validateList, oldValue))
              break;
        } catch(err) {
          return;
        }

        if (parsedValue) {
          if (typeof parsedValue != "string")
            throw new TypeError("Custom parser error: string was expected");

          value = parsedValue;

          if (!Array.isArray(value)) {
            isRepeatable = 0;
            break;
          }

          value = value[0];
        }

        break;
    }

    if (!value || !validate())
      return;

    if (!isRepeatable)
      delete o[key];

    if (!o[key]) {
      o[key] = [ value ];
      return value;
    }

    if (o[key].includes(value))
      return value;

    o[key].push(value);
    return value;
  };

  const parseInputArgs = (o, key, value, callbackFunc) => {
    if (!key)
      return;

    if (typeof key == "string") {
      if (typeof value != "string") {
        if (Array.isArray(value)) {
          for (value of value)
            parseInputArgs(o, key, value, callbackFunc);

          return;
        }

        if (!value) {
          key = key.split("&").map(key => key.split("="));

          for ([key, value] of key) {
            if (!value)
              return;

            parseInputArgs(o, key, value, callbackFunc);
          }

          return;
        }
      }

      callbackFunc(o, o._params, key, value);
      return;
    }

    if (Array.isArray(key)) {
      for ([key, value] of key)
        parseInputArgs(o, key, value, callbackFunc);

      return;
    }

    if (typeof key != "object")
      return;

    parseInputArgs(o, Object.entries(key), value, callbackFunc);
  };

  const pushFunction = (o, prop, fn) => {
    if (typeof fn == "function")
      o[prop].push(fn);
  };

  function MagnetURI(data) {
    if (!new.target)
      return new MagnetURI(data);

    this._params     = {};
    this._validators = this.constructor._validators.slice();
    this._parsers    = this.constructor._parsers.slice();

    if (!data)
      return;

    try {
      if (typeof data == "string")
        this.add(/^magnet\:\?(.*)/.exec(data)[1]);
      else
        this.add(data);
    } catch(err) {
      throw new Error("Invalid magnet uri.");
    }
  }

  Object.assign(MagnetURI.prototype, {
    get: function(key) {
      if (!key)
        return this._params;

      return this._params[key];
    },

    add: function(key, value) {
      parseInputArgs(this, key, value, modifyParamsList);
    },

    remove: function(key, value) {
      if (!key)
        return;

      if (Array.isArray(key) && !key.every(x => Array.isArray(x))) {
        for (key of key) {
          if (Array.isArray(key))
            [key, value] = key;

          this.remove(key, value);
        }

        return;
      }

      if (typeof key == "string" && !/=/.test(key) && !value) {
        delete this._params[key];
        return;
      }

      parseInputArgs(this, key, value, (magnetObj, o, key, value) => {
        let arr = o[key],
            i;

        if (!arr)
          return;

        value = modifyParamsList(magnetObj, o, key, value);
        i     = arr.indexOf(value);

        if (i >= 0)
          arr.splice(i, 1);
      });
    },

    set: function(key, value) {
      if (typeof key != "string" || !key)
        return;

      this.remove(key);
      this.add(key, value);
    },

    toString: function() {
      const append = (key, fn) => {
        try {
          str += `&${key}=` + fn(this._params[key][0]);
        } catch(err) {
        }
      };

      const pass = value => value;

      let str = "",
          key,
          value,
          values,
          keys;

      try {
        this._params.xt.forEach(xt => str += "&xt=" + xt);
      } catch(err) {
        throw new Error("Invalid magnet uri.");
      }

      str = "magnet:?" + str.slice(1);
      append("dn", encodeURIComponent);
      append("xl", pass);
      append("kt", pass);
      append("so", pass);

      for (key of ["tr", "xs", "as", "ws"]) {
        if (!this._params[key])
          continue;

        for (value of this._params[key])
          str += `&${key}=` + encodeURIComponent(value);
      }

      if (this._params["x.pe"])
        for (value of this._params["x.pe"])
          str += `&x.pe=` + value;

      keys = Object.entries(this._params)
        .filter(([key]) => !paramsList.includes(key));

      for ([key, values] of keys)
        for (value of values)
          str += `&${key}=` + value;

      return str;
    },

    valueOf: function() {
      return this.toString();
    },

    addValidator: function(fn) {
      pushFunction(this, "_validators", fn);
    },

    addParser: function(fn) {
      pushFunction(this, "_parsers", fn);
    }
  });

  Object.assign(MagnetURI, {
    parseXT,
    parseSO,
    parseXPE,
    _validators:             [],
    _parsers:                [],

    addValidator: function(fn) {
      pushFunction(this, "_validators", fn);
    },

    addParser: function(fn) {
      pushFunction(this, "_parsers", fn);
    }
  });

  g.MagnetURI = MagnetURI;
})(window);
