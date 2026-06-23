/**
 * Cap Hashcat Web — Native Node.js Cap to HC22000 Converter
 * Extracts EAPOL handshakes and PMKIDs from pcap/pcapng files.
 */

const fs = require('fs');

// Constants
const PCAP_MAGIC_LE = 0xa1b2c3d4;
const PCAP_MAGIC_BE = 0xd4c3b2a1;
const PCAPNG_MAGIC  = 0x0a0d0d0a;

function readPcapng(buffer, packets) {
    let offset = 0;
    let linkType = 1;

    while (offset + 8 <= buffer.length) {
        const blockType = buffer.readUInt32LE(offset);
        const blockLen = buffer.readUInt32LE(offset + 4);

        if (blockLen < 12 || offset + blockLen > buffer.length) break;

        const body = buffer.subarray(offset + 8, offset + blockLen - 4);

        if (blockType === 0x00000001) { // IDB
            if (body.length >= 4) {
                linkType = body.readUInt16LE(0);
            }
        } else if (blockType === 0x00000006) { // EPB
            if (body.length >= 20) {
                const tsHi = body.readUInt32LE(4);
                const tsLo = body.readUInt32LE(8);
                const capLen = body.readUInt32LE(12);
                const origLen = body.readUInt32LE(16);
                
                if (20 + capLen <= body.length) {
                    const pktData = body.subarray(20, 20 + capLen);
                    // Use BigInt for large timestamps if needed, but Number is fine for seconds
                    const ts = ((tsHi * 4294967296) + tsLo) / 1000000;
                    packets.push({ ts, data: pktData, len: origLen });
                }
            }
        }

        offset += blockLen;
    }
    return linkType;
}

function readPcap(buffer, isBE, packets) {
    if (buffer.length < 24) throw new Error('Truncated pcap header');
    
    const read32 = isBE ? (b, o) => b.readUInt32BE(o) : (b, o) => b.readUInt32LE(o);
    const linkType = read32(buffer, 20);

    let offset = 24;
    while (offset + 16 <= buffer.length) {
        const tsSec = read32(buffer, offset);
        const tsUsec = read32(buffer, offset + 4);
        const inclLen = read32(buffer, offset + 8);
        const origLen = read32(buffer, offset + 12);
        
        offset += 16;
        if (offset + inclLen > buffer.length) break;
        
        const pktData = buffer.subarray(offset, offset + inclLen);
        packets.push({ ts: tsSec + (tsUsec / 1000000), data: pktData, len: origLen });
        
        offset += inclLen;
    }
    return linkType;
}

function parseFile(filepath) {
    const buffer = fs.readFileSync(filepath);
    if (buffer.length < 4) throw new Error('File too small');

    const magic = buffer.readUInt32LE(0);
    const magicBE = buffer.readUInt32BE(0);
    
    const packets = [];
    let linkType = 0;

    if (magic === PCAP_MAGIC_LE) {
        linkType = readPcap(buffer, false, packets);
    } else if (magic === PCAP_MAGIC_BE) {
        linkType = readPcap(buffer, true, packets);
    } else if (magic === PCAPNG_MAGIC) {
        linkType = readPcapng(buffer, packets);
    } else {
        throw new Error('Unknown file format (not pcap/pcapng)');
    }

    return { packets, linkType, isWifi: linkType === 105 || linkType === 127 };
}

function extractTaggedParam(data, tagId) {
    let i = 0;
    while (i < data.length - 1) {
        const t = data[i];
        const l = data[i + 1];
        if (t === tagId) {
            if (i + 2 + l <= data.length) {
                return data.subarray(i + 2, i + 2 + l);
            }
            return null;
        }
        i += 2 + l;
    }
    return null;
}

function extractPMKID(keyData) {
    if (keyData.length < 20) return null;
    let i = 0;
    while (i < keyData.length - 4) {
        const tagType = keyData[i];
        const tagLen = i + 1 < keyData.length ? keyData[i + 1] : 0;
        
        if (tagType === 0xDD && tagLen >= 20) {
            // Check OUI: 00 0F AC 04
            if (keyData[i+2] === 0x00 && keyData[i+3] === 0x0f && keyData[i+4] === 0xac && keyData[i+5] === 0x04) {
                const pmkid = keyData.subarray(i+6, i+22);
                // check if not all zeros
                if (pmkid.some(b => b !== 0)) {
                    return pmkid.toString('hex');
                }
            }
        }
        i += 2 + tagLen;
        if (tagLen === 0) i++;
    }
    return null;
}

function parseWPA(packets, linkType) {
    const beacons = new Map(); // bssid_hex -> essid
    const eapolMsgs = new Map(); // pairKey -> []
    const pmkids = [];

    for (const pkt of packets) {
        let data = pkt.data;
        const ts = pkt.ts;

        if (linkType === 127 && data.length > 4) {
            const rtLen = data.readUInt16LE(2);
            if (data.length > rtLen) data = data.subarray(rtLen);
        } else if (linkType !== 105) {
            continue;
        }

        if (data.length < 24) continue;

        const fc = data.readUInt16LE(0);
        const type = (fc >> 2) & 0x03;
        const subtype = (fc >> 4) & 0x0F;

        // Management frame
        if (type === 0) {
            if (subtype === 8 || subtype === 5) { // Beacon or Probe Resp
                if (data.length < 36) continue;
                const bssid = data.subarray(10, 16);
                const body = data.subarray(24);
                if (body.length < 12) continue;
                
                const essidBuf = extractTaggedParam(body.subarray(12), 0);
                if (essidBuf) {
                    beacons.set(bssid.toString('hex'), essidBuf.toString('utf8').replace(/\0/g, ''));
                }
            }
        } 
        // Data frame
        else if (type === 2) {
            const toDS = (fc >> 8) & 1;
            const fromDS = (fc >> 9) & 1;
            
            let apMac, clMac;
            if (toDS === 0 && fromDS === 1) { // AP -> Client
                clMac = data.subarray(4, 10);
                apMac = data.subarray(10, 16);
            } else if (toDS === 1 && fromDS === 0) { // Client -> AP
                apMac = data.subarray(4, 10);
                clMac = data.subarray(10, 16);
            } else {
                continue;
            }

            const qos = subtype & 0x08 ? 2 : 0;
            const llcStart = 24 + qos;
            if (data.length < llcStart + 8) continue;
            
            const llc = data.subarray(llcStart, llcStart + 8);
            if (llc[6] !== 0x88 || llc[7] !== 0x8e) continue; // Not 802.1X

            let eapol = data.subarray(llcStart + 8);
            if (eapol.length < 99) continue;

            const eapolType = eapol[1];
            if (eapolType !== 3) continue; // Not Key

            // CRITICAL: trim to the declared 802.1X length (4-byte header + body).
            // Captures often append an FCS / padding to the frame; if that trailing
            // data is left in the EAPOL field, hashcat computes the wrong MIC and the
            // hash is uncrackable even with the correct password.
            const declaredLen = 4 + eapol.readUInt16BE(2);
            if (declaredLen >= 99 && declaredLen <= eapol.length) {
                eapol = eapol.subarray(0, declaredLen);
            }

            const keyInfo = eapol.readUInt16BE(5);
            const apNonce = eapol.subarray(17, 49); // used differently depending on dir
            const mic = eapol.subarray(81, 97);
            const keyDataLen = eapol.readUInt16BE(97);
            const keyData = eapol.subarray(99, 99 + keyDataLen);

            const hasAck = !!(keyInfo & 0x0080);
            const hasMic = !!(keyInfo & 0x0100);
            const hasSecure = !!(keyInfo & 0x0200);
            const hasInstall = !!(keyInfo & 0x0040);

            let msgNum = 0;
            if (hasAck && !hasMic) msgNum = 1;
            else if (!hasAck && hasMic && !hasSecure) msgNum = 2;
            else if (hasAck && hasMic && hasInstall) msgNum = 3;
            else if (!hasAck && hasMic && hasSecure) msgNum = 4;

            if (msgNum > 0) {
                const pairKey = `${apMac.toString('hex')}_${clMac.toString('hex')}`;
                if (!eapolMsgs.has(pairKey)) eapolMsgs.set(pairKey, []);
                
                const msgInfo = {
                    msgNum, ts,
                    apMac: apMac.toString('hex'),
                    clMac: clMac.toString('hex'),
                    nonce: apNonce.toString('hex'),
                    mic: mic.toString('hex'),
                    eapolRaw: eapol
                };

                if (msgNum === 1) {
                    const pmkid = extractPMKID(keyData);
                    if (pmkid) pmkids.push({ pmkid, apMac: msgInfo.apMac, clMac: msgInfo.clMac });
                }

                eapolMsgs.get(pairKey).push(msgInfo);
            }
        }
    }

    // Build hashes
    const hashes = new Set();
    const networksFound = new Map();
    let skippedNoEssid = 0;

    for (const [pairKey, msgs] of eapolMsgs.entries()) {
        const parts = pairKey.split('_');
        const apHex = parts[0];
        const clHex = parts[1];

        const essid = beacons.get(apHex) || '';
        const essidHex = Buffer.from(essid, 'utf8').toString('hex');

        // hashcat needs the ESSID as the PBKDF2 salt — a handshake without one
        // (no beacon/probe captured for this AP) is uncrackable, so skip it.
        if (!essid) { skippedNoEssid++; continue; }
        networksFound.set(apHex, { bssid: apHex, essid });

        const m1s = msgs.filter(m => m.msgNum === 1);
        const m2s = msgs.filter(m => m.msgNum === 2);
        const m3s = msgs.filter(m => m.msgNum === 3);

        // M2+M3
        for (const m2 of m2s) {
            for (const m3 of m3s) {
                if (Math.abs(m2.ts - m3.ts) < 5) {
                    const eapolZeroed = Buffer.from(m2.eapolRaw);
                    eapolZeroed.fill(0, 81, 97); // zero MIC
                    hashes.add(`WPA*02*${m2.mic}*${apHex}*${clHex}*${essidHex}*${m3.nonce}*${eapolZeroed.toString('hex')}*02`);
                }
            }
        }

        // M1+M2
        for (const m1 of m1s) {
            for (const m2 of m2s) {
                if (Math.abs(m1.ts - m2.ts) < 5) {
                    const eapolZeroed = Buffer.from(m2.eapolRaw);
                    eapolZeroed.fill(0, 81, 97); // zero MIC
                    hashes.add(`WPA*02*${m2.mic}*${apHex}*${clHex}*${essidHex}*${m1.nonce}*${eapolZeroed.toString('hex')}*01`);
                }
            }
        }
    }

    for (const p of pmkids) {
        const essid = beacons.get(p.apMac) || '';
        const essidHex = Buffer.from(essid, 'utf8').toString('hex');
        if (!essid) { skippedNoEssid++; continue; }
        networksFound.set(p.apMac, { bssid: p.apMac, essid });
        hashes.add(`WPA*01*${p.pmkid}*${p.apMac}*${p.clMac}*${essidHex}***`);
    }

    return {
        hashes: Array.from(hashes),
        networks: Array.from(networksFound.values()),
        skippedNoEssid,
    };
}

function convertToHc22000(inputPath, outputPath) {
    try {
        const parsed = parseFile(inputPath);
        if (!parsed.isWifi) {
            throw new Error(`File does not appear to contain WiFi data (link type: ${parsed.linkType})`);
        }

        const result = parseWPA(parsed.packets, parsed.linkType);
        
        if (result.hashes.length > 0) {
            fs.writeFileSync(outputPath, result.hashes.join('\n') + '\n');
            return {
                success: true,
                hashes: result.hashes.length,
                handshakes: result.hashes.filter(h => h.startsWith('WPA*02*')).length,
                pmkids: result.hashes.filter(h => h.startsWith('WPA*01*')).length,
                networks: result.networks
            };
        } else {
            const hint = result.skippedNoEssid > 0
                ? ` Found ${result.skippedNoEssid} handshake(s)/PMKID(s) but no matching beacon — the capture is missing the network's ESSID, so they can't be cracked. Re-capture so a beacon or probe-response for the target AP is included.`
                : '';
            return {
                success: false,
                hashes: 0,
                error: 'No valid WPA handshakes or PMKIDs found in the capture file.' + hint
            };
        }
    } catch (err) {
        return {
            success: false,
            hashes: 0,
            error: err.message
        };
    }
}

module.exports = { convertToHc22000 };
