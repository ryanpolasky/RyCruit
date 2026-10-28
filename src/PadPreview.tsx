import { CodePreview } from "./CodePreview";

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

const cursors = [
  { name: "Ryan", color: "#377fba", at: twoSum.indexOf("seen =") },
  { name: "Alex", color: "#a36b25", at: twoSum.indexOf("int other") },
];

export function PadPreview() {
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
      <div className="preview-workspace">
        <section className="code-pane">
          <div className="pane-bar">
            <span>Main.java</span>
            <span>Java 17</span>
          </div>
          <CodePreview code={twoSum} cursors={cursors} />
        </section>
        <section className="side-pane">
          <div className="tabs">
            <span className="preview-tab">Output</span>
            <span>Stdin</span>
          </div>
          <div className="output">
            <div className="result-meta">
              <span className="online">Completed</span>
              <span>76 ms · java</span>
            </div>
            <div className="result-by">Ryan</div>
            <pre>[0, 1]</pre>
            <p className="preview-input">
              Input: [2, 7, 11, 15]
              <br />
              Target: 9
            </p>
          </div>
        </section>
      </div>
    </figure>
  );
}
