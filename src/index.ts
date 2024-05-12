import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';
import {
  createToolbarFactory,
  IToolbarWidgetRegistry,
  showDialog,
  ToolbarRegistry
} from '@jupyterlab/apputils';
import { Cell } from '@jupyterlab/cells';
import { IEditorServices } from '@jupyterlab/codeeditor';
import { INotebookTracker } from '@jupyterlab/notebook';
import { ISettingRegistry } from '@jupyterlab/settingregistry';
import { ITranslator, nullTranslator } from '@jupyterlab/translation';
import { Widget } from '@lumino/widgets';
import { AttributeEditor } from './attributeeditor';
import { CellBarExtension, DEFAULT_TOOLBAR } from './celltoolbartracker';
import { CellToolbar, EXTENSION_ID, FACTORY_NAME } from './tokens';
import { CommandIDs } from './commands';
import OpenAI from "openai";
import { privateapi } from "./api"
const openai = new OpenAI({
  apiKey: privateapi.key, dangerouslyAllowBrowser: true// This is the default and can be omitted
});
async function code_checking(code: string, current_code: string) {
  /*
  const prompt="First, remove the content which are not the code. "+
               "Second, you need to run the rest of the code with code interpreter and only give the output,which means give printf value only as output"+
               "or return 'Error!' if the code has syntax error or runtime error";*/       

  const prompt = "You are a python code runner, you need to use code interpreter to run the code and give print() output directly";
  const assistant = await openai.beta.assistants.create({
    name: "coderunner",
    instructions: prompt,
    tools: [{ type: "code_interpreter" }, { type: "file_search" }],
    model: "gpt-4-turbo",
    temperature: 0
    //response_format: { "type": "json_object" }
  });
  const thread = await openai.beta.threads.create();
  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "assistant",
      content: "Forget all previous message before.First,you need to remove the watermark ,comments,and AI assistant comment or any other content not belong to python code,but leave the python code even if it's incomplete." +
        "Then use code interpreter to run the code,even if the code is wrong."
      /*
      "You must not correct any wrong or incomplete code.If the rest code has syntax or runtime errors,do not correct and return only single word 'Error_for_code' "+
      "Second,run the rest of the code and give print() output directly,only give the output from print() without any words."*/
    }
  )
  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "user",
      content: code + '\n' + current_code
    }
  )/*
  let run = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    { assistant_id: assistant.id}
  );*/
  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "assistant",
      content: "If the rest code has syntax or runtime errors,do not correct and return only single word 'Error_for_code' " +
        "OR give print() output directly,only give the directly final outputs from print() function in my python code without any other words.Do not give other outputs"
    }
  )
  let run2 = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    { assistant_id: assistant.id }
  );
  var answer2 = ""
  if (run2.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(
      run2.thread_id
    );
    for (const message of messages.data.reverse()) {
      if (message.content[0].type == 'text') {
        console.log(`${message.role} > ${message.content[0].text.value}`);
        answer2 = message.content[0].text.value;
      }
    }

  }
  else {
    console.log(run2.status);
  }
  const runStep = await openai.beta.threads.runs.steps.list(
    run2.thread_id,
    run2.id
  );
  console.log(runStep);
  console.log(answer2)
  return answer2
}
class performancejudger {
  static assistant = openai.beta.assistants.create({
    name: "improvementjudger",
    instructions: "You are a python code performance judger." +
      "First,calculate the time,memory usage,accuracy or any other metrics judging the code performance.Then compared with the best solution of the description of the code, judge whether the code is the best solution in time,memory usage,accuracy or any other metrics judging the code performance." +
      "Return with a json,which form is defined as follows." +
      "{'performances':{(metrics mentioned below)'},'tips':{'fuzzy_tips': 'clear_tips:','specific_tips': ...},'if_same':,'improvement':}" +
      "Performances return with all dimension's performance of the code like time complexity,memory complexity,accuracy or some metrics related to the code.Using best and OK to judge the code.Tips are used to give the explanation part for 3 types:fuzzy_tips,clear_tips,specific_tips gradually,which means what you still need to improve from the OK aspect below.Review last code the user submit and if_same gives yes or no or first for if the code is basically similar to the some of the code asked before in this chat or it's the first one asked for this algorithm,and if not same as before but of the same function,give improvement demension about the improvement as string between the new and the old code",
    model: "gpt-4-turbo",
    response_format: { "type": "json_object" },
    temperature: 0
  });
  static fuzzy_tips = ''
  static clear_tips = ''
  static specific_tips = ''
  static call_time = 0;
  static threadx = openai.beta.threads.create();
  static last_code = '';
  static last_id = -1;
  static last_improvement = -1;
};
async function api(description: string, code: string, current_code: string, id: number) {
  /*
    const completion = await openai.chat.completions.create({
      messages:
        [{ role: "system", content: "You are a python code performance judger.You need to judge the python code with the description of the code and response whether the code is wrong or right.If the code is right, judge whether the code is the best solution in time and memory usage.Response only with one word:wrong, OK or good" },
        { role: "user", content: "description:" + description },
        { role: "user", content: "code:" + code }
        ],
      model: "gpt-4-turbo-preview"
      //tools: [{ type: "code_interpreter" }],
    });*/
  let ans_check = await code_checking(code, current_code);
  if (ans_check == 'Error_for_code') {
    return "AI assistant: " + "Syntax/Runtime Error!Check the code and run locally again.";
  }
  const prompt = "You are a python code performance judger." +
    "You need to judge the python code with the description of the code and the output and response whether the code is wrong or right." +
    "If the code is right, judge whether the code is the best solution in time and memory usage.";
  const assistant = await openai.beta.assistants.create({
    name: "python code performance judger",
    description: prompt,
    model: "gpt-4-turbo"
  });

  const thread = await openai.beta.threads.create();

  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "user",
      content: "description:" + description + "\n" + "code:" + code + '\n' + current_code
    }
  );
  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "assistant",
      content: "judge whether the code is completed.It means the code has finished all what description needs." + '\n' +
        "For example,if the code has lost serveral code of one function,like not updating the result or calculate answers.Return only two words:good or bad"
    }
  );
  let run = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    { assistant_id: assistant.id }
  );
  let answer = ""
  if (run.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(
      run.thread_id
    );
    for (const message of messages.data.reverse()) {
      if (message.content[0].type == 'text') {
        console.log(`${message.role} > ${message.content[0].text.value}`);
        answer = message.content[0].text.value;
      }
    }

  }
  else {
    console.log(run.status);
  }
  console.log(answer)
  if (answer == 'bad' || answer == 'Bad') {
    return "AI assistant: " + "It seems that you have missed some parts of the code. Please finish all the code and then challenge yourself!";
  }
  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "assistant",
      content: "judge whether the code outputs the correct result as the description needs.Just judge by outputthye user give,description, and code,return only single word: correct or wrong"
    }
  );
  await openai.beta.threads.messages.create(
    thread.id,
    {
      role: "user",
      content: ans_check
    }
  );
  let run2 = await openai.beta.threads.runs.createAndPoll(
    thread.id,
    { assistant_id: assistant.id }
  );
  let answer2 = ""
  if (run2.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(
      run.thread_id
    );
    for (const message of messages.data.reverse()) {
      if (message.content[0].type == 'text') {
        console.log(`${message.role} > ${message.content[0].text.value}`);
        answer2 = message.content[0].text.value;
      }
    }

  }
  else {
    console.log(run.status);
  }
  if (answer2 == 'wrong' || answer2 == 'Wrong') {
    return "AI assistant: " + "You seem not to implement the right code. Try to modify the code and challenge again!";
  }/*
  const completion = await openai.chat.completions.create(
  {
    messages: [{"role": "system", "content": "You are a python code performance judger.First,calculate the time,memory usage,accuracy or any other metrics judging the code performance.Then compared with the best solution of the description of the code, judge whether the code is the best solution in time,memory usage,accuracy or any other metrics judging the code performance.Return with a json with all dimension's performance of the code.Using best and OK to judge the code,give the explanation part"},
        {"role": "assistant", "content": "Here's the description of the code: "+description},
        {"role": "user", "content": code+'\n'+current_code},
        ],
    model: "gpt-4-turbo",
    response_format:{"type":"json_object"}
  });
  console.log(completion.choices[0]);
  let obj = JSON.parse(completion.choices[0].message.content as string);
  let improvement=0;
  for(let val in obj)
    {
      console.log(obj[val])
      if(obj[val]=='OK')
        {
          improvement=improvement+1;
        }
    }
  if(improvement==0)
    {
      return "AI assistant: "+"Good job!Nothing to improve";
    }
  else if(improvement==1)
    return "AI assistant: "+"Correct! Close to the best answer, try to improve your code!";
  else
    return "AI assistant: "+"Code is correct, and try to challange yourself with better ideas!";*/
  //
  await openai.beta.threads.messages.create(
    (await performancejudger.threadx).id,
    {
      role: "assistant",
      content: "Here's the description of the code and return the same type as the first response with fuzzy_tips,clear_tips,specific_tips,if_same and: aspects of metrics and explanations" + description
    }
  );
  await openai.beta.threads.messages.create(
    (await performancejudger.threadx).id,
    {
      role: "user",
      content: code + '\n' + current_code
    }
  );
  const threadMessages = await openai.beta.threads.messages.list((await performancejudger.threadx).id);
  console.log(threadMessages.data);
  let x = new performancejudger;
  console.log(x)
  console.log(performancejudger.last_code)
  console.log(current_code)
  console.log(performancejudger.last_code == current_code || performancejudger.last_code + "\n" == current_code)
  console.log(performancejudger.call_time)
  if (performancejudger.last_code + "\n" == current_code || performancejudger.last_code == current_code && performancejudger.call_time > 0) {

    if (performancejudger.last_improvement == 0) {
      return "AI assistant: " + "Good job!Nothing to improve";
    }
    performancejudger.call_time++;
    console.log(performancejudger.call_time)
    if (performancejudger.call_time == 1) {
      return "AI assistant: " + performancejudger.fuzzy_tips;
    }
    else if (performancejudger.call_time == 2) {
      return "AI assistant: " + performancejudger.clear_tips;
    }
    else if (performancejudger.call_time == 3) {
      return "AI assistant: " + performancejudger.specific_tips;
    }
    else {
      return "AI assistant: No more tips,please challenge yourself with tips above!"
    }
  }
  let runx = await openai.beta.threads.runs.createAndPoll(
    (await performancejudger.threadx).id,
    { assistant_id: (await performancejudger.assistant).id }
  );
  let answerx = ""
  if (runx.status === 'completed') {
    const messages = await openai.beta.threads.messages.list(
      runx.thread_id
    );
    for (const message of messages.data.reverse()) {
      if (message.content[0].type == 'text') {
        console.log(`${message.role} > ${message.content[0].text.value}`);
        answerx = message.content[0].text.value;
      }
    }

  }
  else {
    console.log(runx.status);
  }
  console.log(answerx)
  let obj = JSON.parse(answerx);
  if (performancejudger.last_code + "\n" == current_code || performancejudger.last_code == current_code || obj['if_same'] == 'yes' || obj['if_same'] == 'Yes') {
    performancejudger.last_code = current_code;
    performancejudger.last_id = id;
    let improvement = 0;
    for (let val in obj['performances']) {
      console.log(obj['performances'][val])
      if (obj['performances'][val] == 'OK') {
        improvement = improvement + 1;
      }
    }
    performancejudger.last_improvement = improvement;
    if (improvement == 0) {
      return "AI assistant: " + "Good job!Nothing to improve";
    }
    performancejudger.call_time++;
    console.log(performancejudger.call_time)
    if (performancejudger.call_time == 1) {
      performancejudger.fuzzy_tips = obj['tips']['fuzzy_tips'];
      performancejudger.clear_tips = obj['tips']['clear_tips'];
      performancejudger.specific_tips = obj['tips']['specific_tips'];
      return "AI assistant: " + performancejudger.fuzzy_tips;
    }
    else if (performancejudger.call_time == 2) {
      return "AI assistant: " + performancejudger.clear_tips;
    }
    else if (performancejudger.call_time == 3) {
      return "AI assistant: " + performancejudger.specific_tips;
    }
    else {
      return "AI assistant: No more tips,please challenge yourself with tips above!"
    }
  }
  else if (performancejudger.last_code == '' || performancejudger.last_id != id || obj['if_same'] == 'first' || obj['if_same'] == 'First') {
    performancejudger.last_code = current_code;
    performancejudger.last_id = id;
    performancejudger.call_time = 0;
    let improvement = 0;
    for (let val in obj['performances']) {
      console.log(obj['performances'][val])
      if (obj['performances'][val] == 'OK') {
        improvement = improvement + 1;
      }
    }
    performancejudger.last_improvement = improvement;
    if (improvement == 0) {
      return "AI assistant: " + "Good job!Nothing to improve";
    }
    else if (improvement == 1)
      return "AI assistant: " + "Correct! Close to the best answer,and try to improve your code!";
    else
      return "AI assistant: " + "Code is correct, and try to challange yourself with better ideas!";
  }
  else if (obj['if_same'] == 'no' || obj['if_same'] == 'No') {
    performancejudger.last_code = current_code;
    performancejudger.last_id = id;
    performancejudger.call_time = 0;
    let improvement = 0;
    for (let val in obj['performances']) {
      console.log(obj['performances'][val])
      if (obj['performances'][val] == 'OK') {
        improvement = improvement + 1;
      }
    }
    performancejudger.last_improvement = improvement;
    if (improvement == 0) {
      return "AI assistant: " + obj['improvement'] + '\n' + "Good job!Nothing to improve";
    }
    else if (improvement == 1)
      return "AI assistant: " + obj['improvement'] + '\n' + "Correct! Close to the best answer,and try to improve your code!";
    else
      return "AI assistant: " + obj['improvement'] + '\n' + "Code is correct, and try to challange yourself with better ideas!";
  }
}
function removeComment(cellContent: string) {
  return cellContent.replace(/('''[\s\S]*?''')/g, '').replace(/\n+$/, '');

}
const DEFAULT_TOOLBAR_ITEM_RANK = 50;

/**
 * Export the icons so they got loaded
 */
export { formatIcon } from './icon';

/**
 * JupyterLab enhanced cell toolbar plugin.
 */
const extension: JupyterFrontEndPlugin<void> = {
  id: `${EXTENSION_ID}:plugin`,
  autoStart: true,
  optional: [ISettingRegistry, ITranslator, IEditorServices],
  requires: [INotebookTracker, IToolbarWidgetRegistry],
  activate: async (
    app: JupyterFrontEnd,
    notebookTracker: INotebookTracker,
    toolbarRegistry: IToolbarWidgetRegistry,
    settingRegistry: ISettingRegistry | null,
    translator: ITranslator | null,
    editorServices: IEditorServices | null
  ) => {
    const trans = (translator ?? nullTranslator).load('cell-toolbar');

    // Extract the list from nbconvert service as in @jupyterlab/notebook-extension
    app.serviceManager.nbconvert
      .getExportFormats()
      .then(response => {
        if (response) {
          const coreTrans = (translator ?? nullTranslator).load('jupyterlab');
          /**
           * The excluded Cell Inspector Raw NbConvert Formats
           * (returned from nbconvert's export list)
           */
          const rawFormatExclude = [
            'pdf',
            'slides',
            'script',
            'notebook',
            'custom' // Exclude this as the input is editable
          ];
          const optionValueArray: [string, string][] = [
            ['pdf', coreTrans.__('PDF')],
            ['slides', coreTrans.__('Slides')],
            ['script', coreTrans.__('Script')],
            ['notebook', coreTrans.__('Notebook')]
          ];

          // convert exportList to palette and menu items
          const formatList = Object.keys(response);
          formatList.forEach(key => {
            if (rawFormatExclude.indexOf(key) === -1) {
              const altOption = coreTrans.__(
                key[0].toUpperCase() + key.slice(1)
              );
              const coreLabel = coreTrans.__(key);
              const option = coreLabel === key ? altOption : coreLabel;
              const mimeTypeValue = response[key].output_mimetype;
              optionValueArray.push([mimeTypeValue, option]);
            }
          });

          toolbarRegistry.registerFactory(
            FACTORY_NAME,
            CellToolbar.ViewItems.RAW_FORMAT,
            (cell: Widget) => {
              if ((cell as Cell).model.type === 'raw') {
                const w = new AttributeEditor({
                  model: (cell as Cell).model,
                  keys: ['raw_mimetype', 'format'],
                  label: trans.__('Raw NBConvert Format'),
                  values: optionValueArray,
                  editable: true,
                  placeholder: trans.__('Click or press 🠗 for suggestions.'),
                  noValue: ''
                });
                w.addClass('jp-enh-cell-raw-format');
                return w;
              } else {
                const widget = new Widget();
                widget.hide();
                return widget;
              }
            }
          );
        } else {
          throw new Error('Fallback to default raw format.');
        }
      })
      .catch(() => {
        toolbarRegistry.registerFactory(
          FACTORY_NAME,
          CellToolbar.ViewItems.RAW_FORMAT,
          (cell: Widget) => {
            if ((cell as Cell).model.type === 'raw') {
              const w = new AttributeEditor({
                model: (cell as Cell).model,
                keys: ['raw_mimetype', 'format'],
                label: trans.__('Raw NBConvert Format'),
                values: [
                  ['text/latex', 'LaTeX'],
                  ['text/restructuredtext', 'ReStructured Text'],
                  ['text/html', 'HTML'],
                  ['text/markdown', 'Markdown'],
                  ['text/x-python', 'Python']
                ],
                editable: true,
                placeholder: trans.__('Click or press 🠗 for suggestions.'),
                noValue: ''
              });
              w.addClass('jp-enh-cell-raw-format');
              return w;
            } else {
              const widget = new Widget();
              widget.hide();
              return widget;
            }
          }
        );
      });

    toolbarRegistry.registerFactory(
      FACTORY_NAME,
      CellToolbar.ViewItems.SLIDESHOW,
      (cell: Widget) => {
        const w = new AttributeEditor({
          model: (cell as Cell).model,
          keys: ['slideshow/slide_type'],
          label: trans.__('Slide Type'),
          values: [
            ['slide', trans.__('Slide')],
            ['subslide', trans.__('Sub-Slide')],
            ['fragment', trans.__('Fragment')],
            ['skip', trans.__('Skip')],
            ['notes', trans.__('Notes')]
          ],
          noValue: '-'
        });
        w.addClass('jp-enh-cell-slide-type');
        return w;
      }
    );
    /*
    toolbarRegistry.registerFactory(
      FACTORY_NAME,
      CellToolbar.ViewItems.ATTACHMENTS,
      (cell: Widget) => {
        if (['markdown', 'raw'].includes((cell as Cell).model?.type)) {
          return new ToolbarButton({
            label: trans.__('Edit Attachments…'),
            actualOnClick: true,
            onClick: async (): Promise<void> => {
              await showDialog({
                title: trans.__('Edit Cell Attachments'),
                body: new AttachmentsEditor(
                  ((cell as Cell).model as IAttachmentsCellModel).attachments,
                  translator ?? nullTranslator
                ),
                buttons: [Dialog.okButton({ label: trans.__('Close') })]
              });
            }
          });
        } else {
          return new Widget();
        }
      }
    );*/
    /*
        if (editorServices) {
          toolbarRegistry.registerFactory(
            FACTORY_NAME,
            CellToolbar.ViewItems.METADATA,
            (cell: Widget) =>
              new ToolbarButton({
                label: trans.__('Edit Metadata…'),
                actualOnClick: true,
                onClick: async (): Promise<void> => {
                  const body = new CellMetadataEditor(
                    (cell as Cell).model.metadata,
                    editorServices.factoryService.newInlineEditor,
                    translator ?? nullTranslator
                  );
                  body.addClass('jp-cell-enh-metadata-editor');
                  await showDialog({
                    title: trans.__('Edit Cell Metadata'),
                    body,
                    buttons: [Dialog.okButton({ label: trans.__('Close') })]
                  });
                }
              })
          );
        }
    */
    // Add the widget extension
    let notebookExtension: CellBarExtension;
    if (settingRegistry) {
      const cellToolbarFactory = createToolbarFactory(
        toolbarRegistry,
        settingRegistry,
        FACTORY_NAME,
        extension.id,
        translator ?? nullTranslator
      );

      settingRegistry
        .load(extension.id)
        .then(async settings => {
          await upgradeSettings(settings);
          notebookExtension = new CellBarExtension(
            app.commands,
            cellToolbarFactory,
            toolbarRegistry,
            settings
          );
          app.docRegistry.addWidgetExtension('Notebook', notebookExtension);
        })
        .catch(reason => {
          console.error(`Failed to load settings for ${extension.id}.`, reason);
        });
    } else {
      notebookExtension = new CellBarExtension(
        app.commands,
        (c: Cell): ToolbarRegistry.IToolbarItem[] =>
          DEFAULT_TOOLBAR.filter(
            item => !item.cellType || item.cellType === c.model.type
          ).map(item => {
            return {
              name: item.name,
              widget: toolbarRegistry.createWidget(FACTORY_NAME, c, item)
            };
          }),
        toolbarRegistry,
        null
      );
      app.docRegistry.addWidgetExtension('Notebook', notebookExtension);
    }

    // Add commands
    app.commands.addCommand(CommandIDs.toggleAttachments, {
      label: trans.__('Show Attachments'),
      execute: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            handler.setViewState(
              CellToolbar.ViewItems.ATTACHMENTS,
              !handler.getViewState(CellToolbar.ViewItems.ATTACHMENTS)
            );
          }
        }
      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.getViewState(CellToolbar.ViewItems.ATTACHMENTS);
          }
        }
        return false;
      }
    });
    app.commands.addCommand(CommandIDs.toggleMetadata, {
      label: trans.__('Show Metadata'),
      execute: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            handler.setViewState(
              CellToolbar.ViewItems.METADATA,
              !handler.getViewState(CellToolbar.ViewItems.METADATA)
            );
          }
        }
      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.getViewState(CellToolbar.ViewItems.METADATA);
          }
        }
        return false;
      }
    });
    app.commands.addCommand(CommandIDs.toggleRawFormat, {
      label: trans.__('Show Raw Cell Format'),
      execute: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            handler.setViewState(
              CellToolbar.ViewItems.RAW_FORMAT,
              !handler.getViewState(CellToolbar.ViewItems.RAW_FORMAT)
            );
          }
        }
      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.getViewState(CellToolbar.ViewItems.RAW_FORMAT);
          }
        }
        return false;
      }
    });
    app.commands.addCommand(CommandIDs.toggleSlideType, {
      label: trans.__('Show Slideshow'),
      execute: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            handler.setViewState(
              CellToolbar.ViewItems.SLIDESHOW,
              !handler.getViewState(CellToolbar.ViewItems.SLIDESHOW)
            );
          }
        }
      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.getViewState(CellToolbar.ViewItems.SLIDESHOW);
          }
        }
        return false;
      }
    });
    app.commands.addCommand(CommandIDs.toggleTags, {
      label: trans.__('Show Tags'),
      execute: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            handler.setViewState(
              CellToolbar.ViewItems.TAGS,
              !handler.getViewState(CellToolbar.ViewItems.TAGS)
            );
          }
        }
      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.getViewState(CellToolbar.ViewItems.TAGS);
          }
        }
        return false;
      }
    });
    app.commands.addCommand(CommandIDs.toggleToolbar, {
      label: trans.__('Show Toolbar'),
      execute: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            handler.isActive = !handler.isActive;
          }
        }
      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.isActive;
          }
        }
        return false;
      }
    });
    app.commands.addCommand(CommandIDs.getResponse, {
      label: trans.__('Get Response'),
      execute: async () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const activeCell = nb.content.activeCell;
          const id = nb.content.activeCellIndex - 1;
          let description = '';
          var i: number;
          let code = '';
          for (i = 0; i <= id; i++) {
            if (nb.content.widgets[i].model.type == 'code')
              code += nb.content.widgets[i].model.toJSON().source + '\n';
            else if (nb.content.widgets[i].model.type == 'markdown')
              description += nb.content.widgets[i].model.toJSON().source + '\n';
          }
          let cellContent = '';
          const currentDate = new Date();
          const formattedDateTime = currentDate.toLocaleString("en-US", {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
            second: 'numeric'
          });
          if (activeCell) {
            cellContent += activeCell.model.toJSON().source;
          }
          console.log(description + cellContent);
          cellContent = removeComment(cellContent);
          console.log(cellContent)
          if (activeCell) {
            const modelJson = activeCell.model.toJSON();
            modelJson.source += "\n'''" + formattedDateTime + "\n" + "AI assistant: judging" + '\n' + "'''";
            activeCell.model.sharedModel.setSource(modelJson.source.toString());
          }
          const judgement = await api(description, code, cellContent, id);
          console.log(judgement);
          if (activeCell) {

            const modelJson = activeCell.model.toJSON();
            let lines = modelJson.source.toString();
            let line = lines.split(/\r?\n/);
            const updatedLines = line.slice(0, -2);
            modelJson.source = updatedLines.join('\n') + '\n' + (judgement as string) + "\n'''";
            activeCell.model.sharedModel.setSource(modelJson.source.toString());
          }
        }

      },
      isToggled: () => {
        const nb = notebookTracker.currentWidget;
        if (nb && notebookExtension) {
          const handler = notebookExtension.getToolbarsHandler(nb);
          if (handler) {
            return handler.isActive;
          }
        }
        return false;
      }
    });
    /**
     * Upgrade the settings from the old format of v3
     * @param settings Extension settings
     */
    async function upgradeSettings(
      settings: ISettingRegistry.ISettings
    ): Promise<void> {
      const iconsMapping: { [name: string]: string } = {
        '@jlab-enhanced/cell-toolbar:code': 'ui-components:code',
        '@jlab-enhanced/cell-toolbar:delete': 'ui-components:delete'
      };
      const current = settings.composite as any;
      let wasUpgraded = false;
      const toolbarDefinition: ISettingRegistry.IToolbarItem[] = [];
      let rank = 0;
      if (current['leftMenu']) {
        wasUpgraded = true;
        (current['leftMenu'] as CellToolbar.IButton[]).forEach(item => {
          if (app.commands.hasCommand(item.command)) {
            toolbarDefinition.push({
              name: [item.command.split(':')[1], item.cellType].join('-'),
              command: item.command,
              icon: iconsMapping[item.icon as string] ?? item.icon,
              rank: rank++
            });
          }
        });
        await settings.remove('leftMenu');
      }
      rank = Math.max(rank, DEFAULT_TOOLBAR_ITEM_RANK);
      toolbarDefinition.push({ name: 'spacer', type: 'spacer', rank });
      if (current['showTags']) {
        wasUpgraded = true;
        toolbarDefinition.push({
          name: CellToolbar.ViewItems.TAGS,
          rank: rank++
        });
        await settings.remove('showTags');
      }
      if (current['rightMenu']) {
        wasUpgraded = true;
        (current['rightMenu'] as CellToolbar.IButton[]).forEach(item => {
          if (app.commands.hasCommand(item.command)) {
            toolbarDefinition.push({
              name: [item.command.split(':')[1], item.cellType].join('-'),
              command: item.command,
              icon: iconsMapping[item.icon as string] ?? item.icon,
              rank: rank++
            });
          }
        });
        await settings.remove('rightMenu');
      }
      if (wasUpgraded) {
        // Disabled default toolbar items
        const names = toolbarDefinition.map(t => t.name);
        for (const item of DEFAULT_TOOLBAR) {
          if (!names.includes(item.name)) {
            toolbarDefinition.push({ name: item.name, disabled: true });
          }
        }
        await settings.set('toolbar', toolbarDefinition);
        await showDialog({
          title: 'Information',
          body: trans.__(
            'The toolbar extension has been upgraded. You need to refresh the web page to take into account the new configuration.'
          )
        });
      }
    }
  }
};

/**
 * Notebook tools plugin
 */
/*
const nbTools: JupyterFrontEndPlugin<void> = {
  id: `${EXTENSION_ID}:tools`,
  autoStart: true,
  activate: async (
    app: JupyterFrontEnd,
    notebookTools: INotebookTools,
    translator: ITranslator | null
  ) => {
    notebookTools.addItem({
      tool: new AttachmentsTool(translator ?? nullTranslator),
      section: 'common'
    });
  },
  optional: [ITranslator],
  requires: [INotebookTools]
};
*/
//export default [extension, nbTools];
export default [extension];
