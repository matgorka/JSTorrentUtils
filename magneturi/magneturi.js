(g => {
  const passValue = value => value;
  const encodeXS  = value =>
    value.startsWith("urn:") ? value : encodeURIComponent(value);

  const rulesList = [
    [/^xt$/, passValue],
    [/^xt\.\d+$/, passValue],
    [/^dn$/, encodeURIComponent],
    [/^xl$/, passValue],
    [/^kt$/, passValue],
    [/^so$/, passValue],
    [/^tr$/, encodeURIComponent],
    [/^xs$/, encodeXS],
    [/^as$/, encodeURIComponent],
    [/^ws$/, encodeURIComponent],
    [/^x.pe$/, encodeURIComponent]
  ];

  const parseXT = uri =>
    /^urn:([A-Z\d]+(?::+[A-Z\d]+)*:*):(.*)/i.exec(uri).slice(1);

  const getIDNAddress = (addr, hasNoProtocol) => {
    let protocol,
        rest,
        urlData,
        sliceI     = 7,
        idnAddr;

    if (hasNoProtocol)
      addr = "http://" + addr;

    [protocol, rest] = /^(\w+:\/*)(.*)/.exec(addr).slice(1);
    urlData          = new URL("http://" + rest);

    if (!urlData.port) {
      urlData = new URL("https://" + rest);
      sliceI  = 8;
    }

    if (["udp://", "tcp://"].includes(protocol) && urlData.port === "")
      throw Error();

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
      [value] = getIDNAddress(value, true);
      host    = /(.*):\d+$/.exec(value)[1];
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

      case "s":
        if (/[^A-F\d]/i.test(value))
          return;

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
      case /^xt(\.\d+)?$/.test(key) ? key : "":
        try {
          usedProtocols = o[key].map(uri => parseXT(uri)[0]);
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
          o[key][i] = value;
          return value;
        }

        break;

      /* check for invalid xt parameter */
      case /^xt\..*/.test(key) ? key : "":
        return;

      /* repeatable address parameters */
      case "x.pe":
        value = parseXPE(value);
        validateList.push(value);
        break;

      case "xs":
        try {
          [protocol, hash] = parseXT(value);

          if (protocol != "btpk" || !validate([protocol, hash]))
            return;

          if (o.xs) {
            i = o.xs.indexOf(/^urn:/);

            if (i >= 0) {
              o.xs[i] = value;
              return value;
            }
          }

          break;
        } catch(err) {
        }

      case "tr":
      case "ws":
      case "as":
        try {
          [value, protocol] = getIDNAddress(value);
        } catch(err) {
          return;
        }

        validateList.push([protocol, value]);
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
            throw TypeError("Custom parser error: string was expected");

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

        if (!value && value != 0) {
          key = key.split("&").map(key => key.split("="));

          for ([key, value] of key) {
            if (!value && value != 0)
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

  class MagnetURI {
    constructor(data) {
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
        throw Error("Invalid magnet uri.");
      }
    }

    get(key) {
      if (!key)
        return this._params;

      return this._params[key];
    }

    add(key, value) {
      parseInputArgs(this, key, value, modifyParamsList);
    }

    remove(key, value) {
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
    }

    set(key, value) {
      if (typeof key != "string" || !key)
        return;

      this.remove(key);
      this.add(key, value);
    }

    addKeywords(keywords) {
      if (!Array.isArray(keywords))
        keywords = [ keywords ];

      this.add("kt",
        keywords
          .filter(keyword => typeof keyword == "string")
          .map(keyword => keyword.split(/\s+/))
          .flat()
          .map(keyword => encodeURIComponent(keyword))
          .join("+"));
    }

    toString() {
      let str            = "",
          param,
          params,
          rules,
          indexedXT,
          indexedXTKeys,
          paramKey,
          values,
          value,
          ruleKey,
          fn,
          isMutable = false,
          i,
          j;

      rules     = rulesList.slice();
      params    = Object.assign({}, this._params);

      if (params.xs) {
        i = params.xs.findIndex(value => value.startsWith("urn:"));

        if (i >= 0) {
          /* hardcoded part */
          rules.splice(2, 0, rules.splice(7, 1)[0]);
          params.xs.splice(0, 0, params.xs.splice(i, 1)[0]);
          isMutable = true;
        }
      }

      params    = Object.entries(params);
      indexedXT = params.filter(([key]) => /^xt\.\d+$/.test(key))
        .map(([key, value]) => [ key.split(".")[1], value])
        .sort((a, b) => a[0] - b[0])
        .map(([key, value]) => [ "xt." + key, value]);

      indexedXTKeys = indexedXT.map(([key]) => key);

      params = params
        .filter(([key]) => !indexedXTKeys.includes(key))
        .concat(indexedXT);

      for ([ruleKey, fn] of rules) {
        for (i in params) {
          [paramKey, values] = params[i];

          if (ruleKey.test(paramKey)) {
            if (!(isMutable && /^xt(\.\d+)?$/.test(paramKey)))
              for (value of values)
                str += `&${paramKey}=` + fn(value);

            params.splice(i, 1);
          }
        }
      }

      for ([paramKey, values] of params)
        for (value of values)
          str += `&${paramKey}=` + value;

      if (isMutable) {
        param = /(&s=[A-F\d]+)&?/i.exec(str);

        try {
          i     = param.index;
          param = param[1];
          str   = str.substr(0, i) + str.substr(i + param.length);
          i     = /^&xs=.*?&/.exec(str)[0].length - 1;
          str   = str.substr(0, i) + param + str.substr(i);
        } catch(err) {
        }
      }

      return "magnet:?" + str.slice(1);
    }

    valueOf() {
      return this.toString();
    }

    toJSON() {
      return this.toString();
    }

    addValidator(fn) {
      pushFunction(this, "_validators", fn);
    }

    addParser(fn) {
      pushFunction(this, "_parsers", fn);
    }
  }

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
