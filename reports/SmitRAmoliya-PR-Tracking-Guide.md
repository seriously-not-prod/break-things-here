# SmitRAmoliya PR Attribution & Tracking Guide

## Summary

You have contributed to the repository in multiple ways. Here's how to find ALL your PRs:

| Category                    | Count    | Status    | Details                                 |
| --------------------------- | -------- | --------- | --------------------------------------- |
| **Directly Authored PRs**   | 24       | Mixed     | PRs where you are the author            |
| **Bot-Authored & Assigned** | 46       | See below | GitHub Actions created, assigned to you |
| **Assigned to You**         | Multiple | Various   | Tasks assigned but not authored         |
| **Involved**                | Multiple | Various   | Commented, reviewed, participated       |

---

## 1️⃣ PRs You Directly Authored (24 total)

**Search Query:**

```
is:pr author:SmitRAmoliya repo:seriously-not-prod/break-things-here
```

**Direct Link:**

```
https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+author:SmitRAmoliya
```

---

## 2️⃣ Bot-Authored PRs Assigned to You (46 total)

### Merged (43 PRs - Cannot be easily modified):

103, 332, 333, 335, 341, 344, 347, 349, 351, 360, 392, 394, 395, 398, 480, 488, 508, 510, 512, 514, 516, 518, 640, 647, 648, 649, 651, 652, 691, 693, 694, 695, 696, 697, 699, 704, 705, 706, 710, 728, 730, 732, 733

### Closed/Not Merged (3 PRs):

97, 101, 318, 324, 327, 330, 334, 340, 686

**Search Query:**

```
is:pr author:github-actions assignee:SmitRAmoliya repo:seriously-not-prod/break-things-here
```

**File Reference:**

```
reports/.bot-authored-assigned-me.json
```

---

## 3️⃣ PRs Assigned to You (All states)

**Search Query:**

```
is:pr assignee:SmitRAmoliya repo:seriously-not-prod/break-things-here
```

**Direct Link:**

```
https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+assignee:SmitRAmoliya
```

---

## 4️⃣ ALL PRs You're Involved In (Authoring + Commenting + Reviewing + Assigned)

**Search Query:**

```
is:pr involves:SmitRAmoliya repo:seriously-not-prod/break-things-here
```

**Direct Link:**

```
https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+involves:SmitRAmoliya
```

---

## 📋 How to Add Co-Author Attribution to Future PRs

### For GitHub Actions/Bots Creating Commits:

Add this to your workflow files (`.github/workflows/*.yml`):

```yaml
- name: Configure Git
  run: |
    git config user.name "SmitRAmoliya"
    git config user.email "88135833+SmitRAmoliya@users.noreply.github.com"

- name: Create Commit with Co-Author
  run: |
    git commit --allow-empty -m "Your commit message

    Co-authored-by: SmitRAmoliya <88135833+SmitRAmoliya@users.noreply.github.com>"
```

### For Manual Commits:

```bash
git commit -m "Your commit message

Co-authored-by: SmitRAmoliya <88135833+SmitRAmoliya@users.noreply.github.com>"
```

---

## 🔍 Quick Reference - All Search Queries

| Purpose                           | Query                                               | Link                                                                                                                      |
| --------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Your Direct PRs**               | `is:pr author:SmitRAmoliya`                         | [Link](https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+author:SmitRAmoliya)                         |
| **Assigned to You**               | `is:pr assignee:SmitRAmoliya`                       | [Link](https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+assignee:SmitRAmoliya)                       |
| **Bot-Authored, You're Assigned** | `is:pr author:github-actions assignee:SmitRAmoliya` | [Link](https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+author:github-actions+assignee:SmitRAmoliya) |
| **All Your Involvement**          | `is:pr involves:SmitRAmoliya`                       | [Link](https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+involves:SmitRAmoliya)                       |
| **Your Merged PRs**               | `is:pr is:merged author:SmitRAmoliya`               | [Link](https://github.com/seriously-not-prod/break-things-here/pulls?q=is:pr+is:merged+author:SmitRAmoliya)               |

---

## 📝 Attribution Record

| Type                    | Count    | File                             | Notes                                      |
| ----------------------- | -------- | -------------------------------- | ------------------------------------------ |
| Bot-Authored & Assigned | 46       | `.bot-authored-assigned-me.json` | Created by GitHub Actions, assigned to you |
| Directly Authored       | 24       | —                                | Authored by SmitRAmoliya directly          |
| Issues Created          | Multiple | —                                | Author field shows SmitRAmoliya            |

---

## ✅ Recommended Actions

1. **Bookmark the search queries** above for quick access
2. **Update CI workflows** to include co-author lines for future automated commits
3. **Reference this guide** when discussing contributions
4. **Maintain the JSON file** with current bot-authored PRs for record-keeping
