import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { HttpClientModule } from '@angular/common/http';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';

import { AppComponent } from './app.component';
import { CandlestickChartComponent } from './candlestick-chart/candlestick-chart.component';
import { BacktestFormComponent } from './backtest-form/backtest-form.component';
import { BacktestResultComponent } from './backtest-result/backtest-result.component';

@NgModule({
  declarations: [
    AppComponent,
    CandlestickChartComponent,
    BacktestFormComponent,
    BacktestResultComponent
  ],
  imports: [
    BrowserModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
