package main

import (
	"encoding/csv"
	"encoding/json"
	"fmt"
	"os"
	"sort"
	"strings"
	"time"

	"github.com/shopspring/decimal"
	"github.com/urfave/cli/v2"
)

type Record struct {
	Date     string          `json:"date"`
	Amount   decimal.Decimal `json:"amount"`
	Category string          `json:"category"`
	Tag      string          `json:"tag"`
	Note     string          `json:"note"`
}

const (
	ledgerFile = "ledger.json"
	lockFile   = "ledger.lock"
)

type FileLock struct {
	path string
}

func NewFileLock(path string) *FileLock {
	return &FileLock{path: path}
}

func (fl *FileLock) Lock() error {
	for {
		f, err := os.OpenFile(fl.path, os.O_CREATE|os.O_EXCL, 0644)
		if err == nil {
			f.Close()
			return nil
		}
		if !os.IsExist(err) {
			return err
		}
		time.Sleep(100 * time.Millisecond)
	}
}

func (fl *FileLock) Unlock() error {
	return os.Remove(fl.path)
}

func loadRecords() ([]Record, error) {
	if _, err := os.Stat(ledgerFile); os.IsNotExist(err) {
		return []Record{}, nil
	}

	data, err := os.ReadFile(ledgerFile)
	if err != nil {
		return nil, err
	}

	var records []Record
	if err := json.Unmarshal(data, &records); err != nil {
		return nil, err
	}

	return records, nil
}

func saveRecords(records []Record) error {
	data, err := json.MarshalIndent(records, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(ledgerFile, data, 0644)
}

func main() {
	app := &cli.App{
		Name:  "ledger",
		Usage: "终端财务记账工具",
		Commands: []*cli.Command{
			{
				Name:      "add",
				Usage:     "添加一笔账目",
				ArgsUsage: "<amount>",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:     "category",
						Aliases:  []string{"c"},
						Usage:    "类别（收入/支出）",
						Required: true,
					},
					&cli.StringFlag{
						Name:    "tag",
						Aliases: []string{"t"},
						Usage:   "标签",
					},
					&cli.StringFlag{
						Name:    "note",
						Aliases: []string{"n"},
						Usage:   "备注",
					},
				},
				Action: func(c *cli.Context) error {
					if c.NArg() != 1 {
						return fmt.Errorf("请提供金额")
					}

					amountStr := c.Args().First()
					amount, err := decimal.NewFromString(amountStr)
					if err != nil {
						return fmt.Errorf("无效的金额: %s", amountStr)
					}

					category := c.String("category")
					if category != "收入" && category != "支出" {
						return fmt.Errorf("类别必须是 '收入' 或 '支出'")
					}

					record := Record{
						Date:     time.Now().Format("2006-01-02 15:04:05"),
						Amount:   amount,
						Category: category,
						Tag:      c.String("tag"),
						Note:     c.String("note"),
					}

					lock := NewFileLock(lockFile)
					if err := lock.Lock(); err != nil {
						return fmt.Errorf("获取文件锁失败: %v", err)
					}
					defer lock.Unlock()

					records, err := loadRecords()
					if err != nil {
						return err
					}

					records = append(records, record)

					if err := saveRecords(records); err != nil {
						return err
					}

					fmt.Println("账目添加成功！")
					return nil
				},
			},
			{
				Name:  "list",
				Usage: "按时间顺序列出所有账目",
				Action: func(c *cli.Context) error {
					records, err := loadRecords()
					if err != nil {
						return err
					}

					if len(records) == 0 {
						fmt.Println("暂无账目记录")
						return nil
					}

					fmt.Println("日期\t\t金额\t类别\t标签\t备注")
					fmt.Println("----------------------------------------")
					for _, r := range records {
						fmt.Printf("%s\t%s\t%s\t%s\t%s\n",
							r.Date, r.Amount.StringFixed(2), r.Category, r.Tag, r.Note)
					}

					return nil
				},
			},
			{
				Name:  "summary",
				Usage: "按类别统计总支出和总收入",
				Action: func(c *cli.Context) error {
					records, err := loadRecords()
					if err != nil {
						return err
					}

					income := decimal.Zero
					expense := decimal.Zero
					tagStats := make(map[string]decimal.Decimal)

					for _, r := range records {
						if r.Category == "收入" {
							income = income.Add(r.Amount)
						} else if r.Category == "支出" {
							expense = expense.Add(r.Amount)
						}
						if r.Tag != "" {
							if _, ok := tagStats[r.Tag]; !ok {
								tagStats[r.Tag] = decimal.Zero
							}
							tagStats[r.Tag] = tagStats[r.Tag].Add(r.Amount)
						}
					}

					fmt.Println("=== 收支统计 ===")
					fmt.Printf("总收入: %s\n", income.StringFixed(2))
					fmt.Printf("总支出: %s\n", expense.StringFixed(2))
					fmt.Printf("结余: %s\n", income.Sub(expense).StringFixed(2))

					if len(tagStats) > 0 {
						fmt.Println("\n=== 标签统计 ===")
						type tagAmount struct {
							Tag    string
							Amount decimal.Decimal
						}
						var sortedTags []tagAmount
						for tag, amount := range tagStats {
							sortedTags = append(sortedTags, tagAmount{tag, amount})
						}
						sort.Slice(sortedTags, func(i, j int) bool {
							return sortedTags[i].Amount.GreaterThan(sortedTags[j].Amount)
						})
						for _, ta := range sortedTags {
							fmt.Printf("%s: %s\n", ta.Tag, ta.Amount.StringFixed(2))
						}
					}

					return nil
				},
			},
			{
				Name:      "export",
				Usage:     "导出指定月份的数据为 CSV 格式",
				ArgsUsage: "[year-month]",
				Flags: []cli.Flag{
					&cli.StringFlag{
						Name:    "output",
						Aliases: []string{"o"},
						Usage:   "输出文件名 (默认: ledger_YYYY-MM.csv)",
					},
				},
				Action: func(c *cli.Context) error {
					records, err := loadRecords()
					if err != nil {
						return err
					}

					if len(records) == 0 {
						fmt.Println("暂无账目记录可导出")
						return nil
					}

					targetMonth := c.Args().First()
					if targetMonth == "" {
						targetMonth = time.Now().Format("2006-01")
					}

					_, err = time.Parse("2006-01", targetMonth)
					if err != nil {
						return fmt.Errorf("无效的月份格式，请使用 YYYY-MM 格式，例如: 2026-05")
					}

					var filtered []Record
					for _, r := range records {
						if len(r.Date) >= 7 && strings.HasPrefix(r.Date, targetMonth) {
							filtered = append(filtered, r)
						}
					}

					if len(filtered) == 0 {
						fmt.Printf("%s 月份暂无账目记录\n", targetMonth)
						return nil
					}

					outputFile := c.String("output")
					if outputFile == "" {
						outputFile = fmt.Sprintf("ledger_%s.csv", targetMonth)
					}

					file, err := os.Create(outputFile)
					if err != nil {
						return fmt.Errorf("创建输出文件失败: %v", err)
					}
					defer file.Close()

					writer := csv.NewWriter(file)
					defer writer.Flush()

					writer.Write([]string{"日期", "金额", "类别", "标签", "备注"})

					for _, r := range filtered {
						writer.Write([]string{
							r.Date,
							r.Amount.StringFixed(2),
							r.Category,
							r.Tag,
							r.Note,
						})
					}

					fmt.Printf("成功导出 %d 条记录到 %s\n", len(filtered), outputFile)
					return nil
				},
			},
		},
	}

	if err := app.Run(os.Args); err != nil {
		fmt.Fprintf(os.Stderr, "错误: %v\n", err)
		os.Exit(1)
	}
}
