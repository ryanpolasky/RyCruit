import { CodePreview } from "./CodePreview";
import { useEffect, useState } from "react";
import type { Lang } from "./types";

const twoSum = `import java.util.*;

class Main {
    static int[] twoSum(int[] nums, int target) {
        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int other = target - nums[i];
            if (seen.containsKey(other)) {
                return new int[] {seen.get(other), i};
            }
            seen.put(nums[i], i);
        }
        return new int[] {};
    }
    public static void main(String[] args) {
        System.out.println(Arrays.toString(twoSum(new int[]{2, 7, 11, 15}, 9)));
    }
}`;

const examples: {
  language: Lang;
  filename: string;
  label: string;
  code: string;
  runtime: number;
  output: string;
}[] = [
  {
    language: "java",
    filename: "Main.java",
    label: "Java 17",
    code: twoSum,
    runtime: 76,
    output: "[0, 1]",
  },
  {
    language: "cpp",
    filename: "main.cpp",
    label: "C++20",
    runtime: 12,
    output: "0 1",
    code: `#include <iostream>
#include <unordered_map>
#include <vector>

std::vector<int> twoSum(const std::vector<int>& nums, int target) {
    std::unordered_map<int, int> seen;
    for (int i = 0; i < nums.size(); ++i) {
        int other = target - nums[i];
        if (seen.contains(other)) return {seen.at(other), i};
        seen[nums[i]] = i;
    }
    return {};
}

int main() {
    const auto result = twoSum({2, 7, 11, 15}, 9);
    std::cout << result[0] << ' ' << result[1] << '\\n';
}`,
  },
  {
    language: "python",
    filename: "main.py",
    label: "Python 3",
    runtime: 24,
    output: "[0, 1]",
    code: `def two_sum(nums, target):
    seen = {}
    for i, value in enumerate(nums):
        other = target - value
        if other in seen:
            return [seen[other], i]
        seen[value] = i
    return []


print(two_sum([2, 7, 11, 15], 9))`,
  },
];

export function PadPreview() {
  const [current, setCurrent] = useState(0);
  useEffect(() => {
    const preference = matchMedia("(prefers-reduced-motion: reduce)");
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => {
      clearInterval(timer);
      if (!preference.matches)
        timer = setInterval(
          () => setCurrent((value) => (value + 1) % examples.length),
          6000,
        );
    };
    update();
    preference.addEventListener("change", update);
    return () => {
      clearInterval(timer);
      preference.removeEventListener("change", update);
    };
  }, []);
  return (
    <figure
      className="pad-preview"
      aria-label="Example pad with two sample cursors and completed output"
    >
      <figcaption>
        <span>
          Example pad <span className="preview-readonly">(read-only)</span>
        </span>
        <span className="preview-people">
          <i /> Ryan <i /> Alex
        </span>
      </figcaption>
      <div className="preview-slides">
        {examples.map((example, index) => (
          <div
            key={example.language}
            className="preview-workspace preview-slide"
            data-active={index === current}
            aria-hidden={index !== current}
            inert={index !== current}
          >
            <section className="code-pane">
              <div className="pane-bar">
                <span>{example.filename}</span>
                <button
                  className="preview-language"
                  aria-label="Cycle example language"
                  onClick={() =>
                    setCurrent((value) => (value + 1) % examples.length)
                  }
                >
                  {example.label}
                </button>
              </div>
              <CodePreview
                code={example.code}
                language={example.language}
                cursors={[
                  {
                    name: "Ryan",
                    color: "#377fba",
                    at: example.code.indexOf("seen"),
                  },
                  {
                    name: "Alex",
                    color: "#a36b25",
                    at: example.code.indexOf("other ="),
                  },
                ]}
              />
            </section>
            <section className="side-pane">
              <div className="tabs">
                <span className="preview-tab">Output</span>
                <span>Stdin</span>
              </div>
              <div className="output">
                <div className="result-meta">
                  <span className="online">Completed</span>
                  <span>
                    {example.runtime} ms · {example.language}
                  </span>
                </div>
                <div className="result-by">Ryan</div>
                <pre>{example.output}</pre>
                <p className="preview-input">
                  Input: [2, 7, 11, 15]
                  <br />
                  Target: 9
                </p>
              </div>
            </section>
          </div>
        ))}
      </div>
    </figure>
  );
}
