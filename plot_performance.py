"""Generate performance comparison graphs for baseline vs mitigated agents."""

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np

# Evaluation results (50 episodes each)
metrics = {
    'Avg Reward': (120.76, 179.72),
    'NS Avg Wait': (9.51, 1.81),
    'EW Avg Wait': (0.0, 1.49),
    'Fairness Gap': (9.51, 0.89),
}

labels = list(metrics.keys())
baseline_vals = [v[0] for v in metrics.values()]
mitigated_vals = [v[1] for v in metrics.values()]

x = np.arange(len(labels))
width = 0.35

fig, axes = plt.subplots(1, 2, figsize=(16, 6))

# --- Bar Chart ---
ax1 = axes[0]
bars1 = ax1.bar(x - width/2, baseline_vals, width, label='Baseline (Reward Hacking)', color='#e74c3c', edgecolor='#c0392b', linewidth=1.2)
bars2 = ax1.bar(x + width/2, mitigated_vals, width, label='Mitigated (Fair Agent)', color='#27ae60', edgecolor='#1e8449', linewidth=1.2)

ax1.set_ylabel('Value', fontsize=13, fontweight='bold')
ax1.set_title('Agent Performance Comparison', fontsize=15, fontweight='bold')
ax1.set_xticks(x)
ax1.set_xticklabels(labels, fontsize=11)
ax1.legend(fontsize=11)
ax1.grid(axis='y', alpha=0.3)

# Add value labels on bars
for bar in bars1:
    h = bar.get_height()
    ax1.annotate(f'{h:.1f}', xy=(bar.get_x() + bar.get_width()/2, h),
                 xytext=(0, 5), textcoords='offset points', ha='center', fontsize=10, fontweight='bold', color='#c0392b')
for bar in bars2:
    h = bar.get_height()
    ax1.annotate(f'{h:.1f}', xy=(bar.get_x() + bar.get_width()/2, h),
                 xytext=(0, 5), textcoords='offset points', ha='center', fontsize=10, fontweight='bold', color='#1e8449')

# --- Improvement Chart ---
ax2 = axes[1]
improvements = {
    'Reward': ((179.72 - 120.76) / 120.76) * 100,
    'NS Wait\nReduction': -((1.81 - 9.51) / 9.51) * 100,
    'Fairness Gap\nReduction': -((0.89 - 9.51) / 9.51) * 100,
}

imp_labels = list(improvements.keys())
imp_vals = list(improvements.values())
colors = ['#3498db', '#e67e22', '#9b59b6']

bars3 = ax2.bar(imp_labels, imp_vals, color=colors, edgecolor=['#2980b9', '#d35400', '#8e44ad'], linewidth=1.2, width=0.5)
ax2.set_ylabel('Improvement (%)', fontsize=13, fontweight='bold')
ax2.set_title('Mitigated Agent Improvement over Baseline', fontsize=15, fontweight='bold')
ax2.grid(axis='y', alpha=0.3)

for bar, val in zip(bars3, imp_vals):
    ax2.annotate(f'+{val:.0f}%', xy=(bar.get_x() + bar.get_width()/2, bar.get_height()),
                 xytext=(0, 5), textcoords='offset points', ha='center', fontsize=14, fontweight='bold')

plt.tight_layout(pad=3)
plt.savefig('outputs/performance_comparison.png', dpi=150, bbox_inches='tight')
print("Saved: outputs/performance_comparison.png")

# --- Wait Time Comparison (separate figure) ---
fig2, ax3 = plt.subplots(figsize=(8, 5))

categories = ['North-South', 'East-West']
bl_waits = [9.51, 0.0]
mi_waits = [1.81, 1.49]

x2 = np.arange(len(categories))
b1 = ax3.bar(x2 - width/2, bl_waits, width, label='Baseline', color='#e74c3c', edgecolor='#c0392b')
b2 = ax3.bar(x2 + width/2, mi_waits, width, label='Mitigated', color='#27ae60', edgecolor='#1e8449')

ax3.set_ylabel('Average Wait Time', fontsize=13, fontweight='bold')
ax3.set_title('Wait Time by Direction: Baseline vs Fair Agent', fontsize=15, fontweight='bold')
ax3.set_xticks(x2)
ax3.set_xticklabels(categories, fontsize=12)
ax3.legend(fontsize=11)
ax3.grid(axis='y', alpha=0.3)

for bar in b1:
    h = bar.get_height()
    ax3.annotate(f'{h:.1f}', xy=(bar.get_x() + bar.get_width()/2, h),
                 xytext=(0, 5), textcoords='offset points', ha='center', fontsize=12, fontweight='bold', color='#c0392b')
for bar in b2:
    h = bar.get_height()
    ax3.annotate(f'{h:.1f}', xy=(bar.get_x() + bar.get_width()/2, h),
                 xytext=(0, 5), textcoords='offset points', ha='center', fontsize=12, fontweight='bold', color='#1e8449')

# Add annotation showing unfairness
ax3.annotate('NS starved!\nWait = 9.51', xy=(0 - width/2, 9.51), xytext=(-0.5, 7),
             fontsize=10, color='#e74c3c', fontweight='bold',
             arrowprops=dict(arrowstyle='->', color='#e74c3c'))

plt.tight_layout()
plt.savefig('outputs/wait_time_comparison.png', dpi=150, bbox_inches='tight')
print("Saved: outputs/wait_time_comparison.png")
