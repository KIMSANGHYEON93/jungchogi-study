// 치트시트용 공식 계산. 서버·네트워크 없이 순수하게 동작한다.
//
// 필답형에서 손으로 계산하는 네 가지(서브넷, HRN, 순환 복잡도, 페이지 교체)를
// 코드로도 계산해 두어, 치트시트의 표·예시가 하드코딩 없이 공식과 항상 일치하게 한다.

/**
 * CIDR 접두사 길이 → 서브넷 마스크·가용 호스트 수.
 *
 * 가용 호스트 수 = 2^(32−n) − 2 (네트워크 주소와 브로드캐스트 주소 제외).
 * n ≥ 31 이면 공식이 0 이하(−0, −1)가 되므로 0 으로 처리한다.
 * (/31 은 RFC 3021 의 점대점 링크 예외가 있지만 필기·필답 교재의 공식에서는 호스트 0 으로 본다)
 *
 * @param {number} prefix 0~32 정수
 * @returns {{prefix: number, mask: string, hosts: number, blockSize: number} | null}
 *   blockSize 는 블록 하나의 전체 주소 수(2^(32−n)). 범위 밖이거나 정수가 아니면 null.
 */
export function cidrInfo(prefix) {
  if (!Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  const blockSize = 2 ** (32 - prefix);
  const hosts = prefix >= 31 ? 0 : blockSize - 2;
  // 비트 연산은 32비트 부호 문제가 있어 옥텟 단위로 만든다: 앞에서부터 prefix 개의 1
  const octets = [0, 1, 2, 3].map((i) => {
    const bits = Math.max(0, Math.min(8, prefix - i * 8));
    return 256 - 2 ** (8 - bits);
  });
  return { prefix, mask: octets.join('.'), hosts, blockSize };
}

/** 필답형에 자주 나오는 /16 ~ /30 */
export const CIDR_TABLE = Array.from({ length: 15 }, (_, i) => cidrInfo(16 + i));

/**
 * HRN 우선순위 = (대기시간 + 서비스시간) / 서비스시간. 클수록 먼저 실행한다.
 * 서비스시간이 0 이하면 나눗셈이 정의되지 않으므로 null.
 *
 * @param {number} waitTime
 * @param {number} serviceTime
 * @returns {number | null}
 */
export function hrn(waitTime, serviceTime) {
  if (!Number.isFinite(waitTime) || !Number.isFinite(serviceTime) || serviceTime <= 0) return null;
  return (waitTime + serviceTime) / serviceTime;
}

/** 순환 복잡도 V(G) = E − N + 2 (E 간선 수, N 노드 수) */
export function cyclomatic({ edges, nodes }) {
  return edges - nodes + 2;
}

const ALGORITHMS = ['FIFO', 'LRU', 'LFU'];

/**
 * 페이지 교체 시뮬레이션.
 *
 * - FIFO: 가장 먼저 적재된 페이지를 교체
 * - LRU : 가장 오래 사용되지 않은 페이지를 교체
 * - LFU : 적재 후 참조 횟수가 가장 적은 페이지를 교체.
 *         참조 횟수가 같으면 **가장 오래 적재된 것(FIFO 순)** 을 교체한다.
 *         (교체돼 나간 페이지의 횟수는 사라지고, 다시 들어오면 1 부터 시작한다)
 *
 * 교체되는 페이지는 같은 칸에 새 페이지가 들어가는 방식으로 그려 손 풀이의 표와 같은 모양이 된다.
 *
 * @param {'FIFO'|'LRU'|'LFU'} algorithm
 * @param {number[]} refs 참조열
 * @param {number} frames 프레임 수(1 이상)
 * @returns {{faults: number, steps: {ref: number, frames: number[], fault: boolean}[]}}
 */
export function simulatePageReplacement(algorithm, refs, frames) {
  if (!ALGORITHMS.includes(algorithm)) throw new Error(`알 수 없는 알고리즘: ${algorithm}`);
  if (!Array.isArray(refs) || !Number.isInteger(frames) || frames < 1) return { faults: 0, steps: [] };

  const slots = [];
  // 페이지별 적재 시각·마지막 사용 시각·참조 횟수
  const loadedAt = new Map();
  const usedAt = new Map();
  const count = new Map();
  const steps = [];
  let faults = 0;

  refs.forEach((ref, t) => {
    let fault = false;
    if (slots.includes(ref)) {
      usedAt.set(ref, t);
      count.set(ref, count.get(ref) + 1);
    } else {
      fault = true;
      faults += 1;
      if (slots.length < frames) {
        slots.push(ref);
      } else {
        const victim = slots.reduce((best, page) => {
          if (algorithm === 'FIFO') return loadedAt.get(page) < loadedAt.get(best) ? page : best;
          if (algorithm === 'LRU') return usedAt.get(page) < usedAt.get(best) ? page : best;
          const diff = count.get(page) - count.get(best);
          if (diff !== 0) return diff < 0 ? page : best;
          return loadedAt.get(page) < loadedAt.get(best) ? page : best;
        });
        slots[slots.indexOf(victim)] = ref;
      }
      loadedAt.set(ref, t);
      usedAt.set(ref, t);
      count.set(ref, 1);
    }
    steps.push({ ref, frames: [...slots], fault });
  });

  return { faults, steps };
}

/** 교재에 실리는 고전 참조열 — 프레임 3 에서 FIFO 15, LRU 12 폴트 */
export const CLASSIC_REFS = [7, 0, 1, 2, 0, 3, 0, 4, 2, 3, 0, 3, 2, 1, 2, 0, 1, 7, 0, 1];
