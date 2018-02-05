/**
 * @param {JSRecord<db:/ma_anagrafiche/ditte>} 	ditta
 * @param {Date} 								periodo
 * @param {Array<Number>}						lavoratori
 * @param 										oreObject
 * @param {Function}							[eventsFilter]
 * @param {Boolean} 							[showWorkableHours]
 * 
 * @properties={typeid:24,uuid:"461D085A-1D07-4BDD-ABAF-A72DFA67E482"}
 */
function ExportHours(ditta, periodo, lavoratori, oreObject, eventsFilter, showWorkableHours)
{
	try
	{
		if(!ditta)
			throw new Error('Nessuna ditta specificata');
		
		var cols  = ['idlavoratore',   'codice'	       , 'nominativo' , 'giorno'		 , 'ordine'        , 'evento'     , 'ore'	       , 'tipo'		  ];
		var types = [JSColumn.INTEGER, JSColumn.INTEGER, JSColumn.TEXT, JSColumn.DATETIME, JSColumn.INTEGER, JSColumn.TEXT, JSColumn.NUMBER, JSColumn.TEXT];
		
		var dataset = databaseManager.createEmptyDataSet(0, cols);
		
		var query_lavoratori = datasources.db.ma_anagrafiche.lavoratori.createSelect();
			query_lavoratori.where.add(query_lavoratori.columns.idlavoratore.isin(lavoratori));
		
		/** @type {JSFoundset<db:/ma_anagrafiche/lavoratori>} */
		var lavoratoriFoundset = databaseManager.getFoundSet(query_lavoratori);
		var ore = oreObject;
		var eventi = [], proprieta = [];
		
		for(var l = 1; l <= lavoratoriFoundset.getSize(); l++)
		{
			var lavoratore        = lavoratoriFoundset.getRecord(l);
			var eventiLavoratore  = [];
			var giorniSenzaEventi = [];
			var row 			  = [];
			var datiLavoratore    = [lavoratore.idlavoratore, lavoratore.codice, lavoratore.lavoratori_to_persone.nominativo];
														
			for(var day = scopes.date.FirstDayOfMonth(periodo); day <= scopes.date.LastDayOfMonth(periodo); day = scopes.date.AddDay(day))
			{
				row = datiLavoratore.concat([day]);
				
				var giorno     = utils.dateFormat(day, globals.ISO_DATEFORMAT);
				var datiGiorno = ore[lavoratore.idlavoratore] && ore[lavoratore.idlavoratore][giorno];
				
				if(datiGiorno)
				{					
					if(showWorkableHours)
						dataset.addRow(row.concat([0, 'L*', null, (datiGiorno && datiGiorno.workable_hours) || null, 'O']));

					/** @type {Array} */
					var arrDatiGiorno = datiGiorno['events'];
					if (arrDatiGiorno && arrDatiGiorno.length > 0)
					{
						if(eventsFilter)
							arrDatiGiorno = arrDatiGiorno.filter(eventsFilter);
						
						arrDatiGiorno.forEach(function(_)
												  {
													  var fullEvent = _.code;
													  if(_.property)
														  fullEvent += ' (' + _.property + ')';
													  
													  dataset.addRow(row.concat([1, fullEvent, _.hours, _.type]));
													  
													  // Tieni traccia degli eventi già inclusi per questo lavoratore (per la visualizzazione dei giorni senza eventi)
													  if(eventiLavoratore.map(function(_e){ return _e.id; }).indexOf(_.id) == -1)
														  eventiLavoratore.push(_);
												 });
					}
					else
						giorniSenzaEventi.push(day);
				}
				else
					giorniSenzaEventi.push(day);
			}
			
			giorniSenzaEventi.forEach(
				function(_day)
				{ 
					row = datiLavoratore.concat(_day);
					eventiLavoratore.forEach(
						function(_e)
						{
							var fullEvent = _e.code;
							if(_e.property)
								fullEvent += ' (' + _e.property + ')';
							
							dataset.addRow(row.concat([1, fullEvent, null, _e.type]));
						})
				});
			
			eventi    = eventi.concat(eventiLavoratore.map(function(_){ return parseInt(_.id); }));
			proprieta = proprieta.concat(eventiLavoratore.map(function(_){ return _.property; }));
		}
		
		var reportName = scopes.psl.Presenze.Report.Riepilogo;
		var params = { periodo: periodo, codice_ditta: ditta.codice, ragione_sociale: ditta.ragionesociale };
			
		var fs = databaseManager.getFoundSet(dataset.createDataSource('ds_riepilogo_presenze', types));
			fs.loadRecords();
			fs.sort('nominativo asc, codice asc, evento asc, giorno asc');
			
		var report = plugins.jasperPluginRMI.runReport(fs, reportName + '.jasper', false, plugins.jasperPluginRMI.OUTPUT_FORMAT.PDF, params);
		if(!report)
			throw new Error('Errore durante la creazione della stampa');
		
		params.eventi = eventi.length > 0 ? eventi : [-1];
		params.proprieta = proprieta.length > 0 ? proprieta : [-1];
		params.mostra_lavorabili = showWorkableHours ? 1 : 0;
		
		var legenda = plugins.jasperPluginRMI.runReport(globals.Server.MA_PRESENZE, reportName + '_Legenda.jasper', false, plugins.jasperPluginRMI.OUTPUT_FORMAT.PDF, params);
		if(!legenda)
			throw new Error('Errore durante la creazione della stampa (Legenda)');
		
		var file = plugins.pdf_output.combinePDFDocuments([legenda, report]);
		
		return plugins.file.writeFile(['Riepilogo_Presenze', ditta.codice, utils.dateFormat(periodo, globals.PERIODO_DATEFORMAT)].join('_') + '.pdf', file, globals.MimeTypes.PDF);
	}
	catch(ex)
	{
		globals.ma_utl_logError(ex);
		return false;
	}
}